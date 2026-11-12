import type { AnyRouter } from "@tanstack/react-router";
import type { ClientSettings } from "@t3tools/contracts/settings";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { Atom, AtomRegistry } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers, stubGlobal } from "../../test/render";

const state = vi.hoisted(() => ({
  mode: "off" as ClientSettings["notificationMode"],
  inApp: true,
  add: vi.fn((_toast: { title: string }) => "toast-1"),
  close: vi.fn(),
  sound: vi.fn(),
  notification: vi.fn(function (_title: string, options: NotificationOptions) {
    return Object.assign(new EventTarget(), { tag: options.tag, close: vi.fn() });
  }),
}));

vi.mock(import("../state/shell"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentShell: {
      ...actual.environmentShell,
      stateValueAtom: (() => shellAtom) as never,
    },
  };
});
vi.mock(import("../state/presentation"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    environmentSummaries: {
      ...actual.environmentSummaries,
      // Read lazily: the factory runs before this module's own bindings exist.
      get environmentIdsAtom() {
        return environmentIdsAtom as never;
      },
    },
  };
});
vi.mock(import("../hooks/useSettings"), async (original) => ({
  ...(await original()),
  subscribeClientSettings: (() => () => undefined) as never,
  getClientSettings: (() => ({
    notificationMode: state.mode,
    inAppNotificationsEnabled: state.inApp,
  })) as never,
}));
vi.mock(import("../threadNotifications"), async (original) => ({
  ...(await original()),
  playNotificationSound: state.sound,
  unlockNotificationAudio: vi.fn(),
  setNotificationBadge: vi.fn(),
}));
vi.mock(import("./ui/toast"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    toastManager: { ...actual.toastManager, add: state.add as never, close: state.close },
  };
});

import { startThreadNotifications } from "./ThreadNotificationCoordinator";

const shellAtom = Atom.make<unknown>(null);
const environmentIdsAtom = Atom.make<ReadonlyArray<string>>(["env-1"]);
const SHELL_NOW = DateTime.makeUnsafe("2026-09-13T09:00:00.000Z");

interface ThreadInput {
  readonly runId?: string;
  readonly completedAt?: string | null;
  readonly settled?: boolean;
  readonly background?: ReadonlyArray<{
    taskId: string;
    kind: "command" | "monitor";
    awaited?: boolean;
  }>;
}

function threadShell(input: ThreadInput) {
  const completedAt = input.completedAt ?? null;
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Fix the login form",
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: "thread-1", parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: input.runId ?? "run-1",
    activeRunId: null,
    status: completedAt ? "completed" : "running",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: input.background ?? [],
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: SHELL_NOW,
    updatedAt: SHELL_NOW,
    latestRunRequestedAt: SHELL_NOW,
    latestRunStartedAt: SHELL_NOW,
    latestRunCompletedAt: completedAt ? DateTime.makeUnsafe(completedAt) : undefined,
    archivedAt: null,
    settledOverride: input.settled ? "settled" : null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

// Resets the shared mock state and starts the service with a running thread. `show` replaces
// the thread, and `waitOutGrace` runs the timers it left pending.
function setup(options: { readonly focused?: boolean } = {}) {
  vi.clearAllMocks();
  Object.assign(state, { mode: "off", inApp: true });
  const stack = new AsyncDisposableStack();
  const registry = AtomRegistry.make();
  stack.defer(() => registry.dispose());
  const show = (input: ThreadInput) =>
    registry.set(shellAtom, {
      status: "live",
      snapshot: Option.some({ threads: [threadShell(input)] }),
    });
  show({});
  stack.use(vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"));
  stack.use(vi.spyOn(document, "hasFocus").mockReturnValue(options.focused ?? true));
  stack.use(
    stubGlobal("Notification", Object.assign(state.notification, { permission: "granted" })),
  );
  const router = {
    state: { matches: [{ params: { environmentId: "env-1", threadId: "other-thread" } }] },
    navigate: vi.fn(),
  } as unknown as AnyRouter;
  return {
    start: () => {
      stack.defer(startThreadNotifications(registry, router));
    },
    show,
    waitOutGrace: () => vi.runOnlyPendingTimersAsync(),
    [Symbol.asyncDispose]: () => stack.disposeAsync(),
  };
}

describe("thread notifications", () => {
  it("alerts when only a dev server is left running, not while the agent waits on a monitor", async () => {
    await using app = setup();
    app.start();
    using _timers = fakeTimers();

    app.show({
      completedAt: "2026-09-13T10:00:00.000Z",
      background: [{ taskId: "watch", kind: "monitor", awaited: true }],
    });
    await app.waitOutGrace();
    expect(state.add).not.toHaveBeenCalled();
    // The monitor stops before the agent wakes: that turn already ended while waiting.
    app.show({
      completedAt: "2026-09-13T10:00:00.000Z",
      background: [{ taskId: "dev", kind: "command" }],
    });
    await app.waitOutGrace();
    expect(state.add).not.toHaveBeenCalled();
    // The woken turn ends with only the dev server and its watchdog running.
    app.show({
      runId: "run-2",
      completedAt: "2026-09-13T10:05:00.000Z",
      background: [
        { taskId: "dev", kind: "command" },
        { taskId: "dev-watchdog", kind: "monitor" },
      ],
    });
    await app.waitOutGrace();
    expect(state.add).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Thread completed" }),
    );
  });

  it("keeps settled threads silent and does not replay them when reopened", async () => {
    await using app = setup();
    state.mode = "notifications-and-sound";
    app.start();
    using _timers = fakeTimers();

    app.show({ completedAt: "2026-09-13T10:00:00.000Z", settled: true });
    await app.waitOutGrace();
    app.show({ completedAt: "2026-09-13T10:00:00.000Z" });
    await app.waitOutGrace();
    expect(state.sound).not.toHaveBeenCalled();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();
  });

  it("replaces the earlier toast when the same thread alerts again", async () => {
    await using app = setup();
    state.add.mockReturnValueOnce("toast-1").mockReturnValueOnce("toast-2");
    app.start();
    using _timers = fakeTimers();

    app.show({ completedAt: "2026-09-13T10:00:00.000Z" });
    await app.waitOutGrace();
    expect(state.close).not.toHaveBeenCalled();
    app.show({ runId: "run-2", completedAt: "2026-09-13T10:05:00.000Z" });
    await app.waitOutGrace();
    expect(state.add).toHaveBeenCalledTimes(2);
    expect(state.close).toHaveBeenCalledExactlyOnceWith("toast-1");
    expect(state.close.mock.invocationCallOrder[0]).toBeLessThan(
      state.add.mock.invocationCallOrder[1]!,
    );
  });

  it("leaves background macOS alerts to the desktop app but keeps the sound", async () => {
    await using app = setup({ focused: false });
    using _bridge = stubGlobal("desktopBridge", {
      getClientPlatform: () => "darwin",
      syncNotifications: vi.fn(),
      onNotificationBadgeClear: () => () => undefined,
      setNotificationBadge: async () => undefined,
    });
    state.mode = "notifications-and-sound";
    app.start();
    using _timers = fakeTimers();

    app.show({ completedAt: "2026-09-13T10:00:00.000Z" });
    await app.waitOutGrace();
    expect(state.sound).toHaveBeenCalledWith("completion", expect.any(Function));
    expect(state.notification).not.toHaveBeenCalled();
  });
});
