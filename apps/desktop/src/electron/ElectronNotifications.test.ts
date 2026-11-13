import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import type * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  DesktopNotification as DesktopNotificationSchema,
  EnvironmentId,
  ThreadId,
  type DesktopNotificationThread,
  type NotificationMode,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { DesktopEnvironment } from "../app/DesktopEnvironment.ts";
import {
  DesktopIpc,
  type DesktopIpcMethod,
  type DesktopIpcInvokeEvent,
} from "../ipc/DesktopIpc.ts";
import * as Channels from "../ipc/channels.ts";
import { emptyNotificationState, NotificationState } from "../notifications/model.ts";
import { ElectronWindow } from "./ElectronWindow.ts";
import { installElectronNotifications } from "./ElectronNotifications.ts";

const runtime = vi.hoisted(() => ({
  focused: false,
  badge: vi.fn(),
  remove: vi.fn(),
  show: vi.fn(),
  sent: vi.fn(),
  close: vi.fn(),
  activate: null as ((details: { arguments: string }) => void) | null,
  created: [] as Array<{ id: string; silent?: boolean; toastXml?: string }>,
}));
vi.mock("electron", () => ({
  app: { setBadgeCount: runtime.badge },
  BrowserWindow: { getAllWindows: () => [{ isFocused: () => runtime.focused }] },
  Notification: class {
    static isSupported() {
      return true;
    }
    static getHistory() {
      return Promise.resolve([]);
    }
    static remove = runtime.remove;
    static handleActivation(callback: (details: { arguments: string }) => void) {
      runtime.activate = callback;
    }
    id: string;
    constructor(options: { id: string; silent?: boolean; toastXml?: string }) {
      this.id = options.id;
      runtime.created.push(options);
    }
    on() {
      return this;
    }
    show() {
      runtime.show(this.id);
    }
    close() {
      runtime.close(this.id);
    }
  },
}));

const encodeState = Schema.encodeSync(Schema.fromJsonString(NotificationState));
const decodeState = Schema.decodeUnknownSync(Schema.fromJsonString(NotificationState));
const decodeItems = Schema.decodeUnknownSync(Schema.Array(DesktopNotificationSchema));

function harness(platform: NodeJS.Platform = "darwin") {
  runtime.focused = false;
  runtime.created = [];
  runtime.activate = null;
  vi.clearAllMocks();
  const files = new Map<string, string>();
  const methods = new Map<
    string,
    (value: unknown, event: DesktopIpcInvokeEvent) => Effect.Effect<unknown>
  >();
  const main = {
    webContents: { id: 7, isDestroyed: () => false, isLoading: () => false, send: runtime.sent },
    isMinimized: () => false,
    show: () => {},
    focus: () => {},
  } as unknown as Electron.BrowserWindow;
  const fs = FileSystem.makeNoop({
    readFileString: (file) =>
      Effect.succeed(files.get(file) ?? encodeState(emptyNotificationState())),
    writeFileString: (file, value) =>
      Effect.sync(() => {
        files.set(file, value);
      }),
    rename: (from, to) =>
      Effect.sync(() => {
        files.set(to, files.get(from)!);
        files.delete(from);
      }),
    makeDirectory: () => Effect.void,
  });
  const install = installElectronNotifications().pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provide(Path.layer),
    Effect.provideService(HostProcess.Platform, platform),
    Effect.provideService(DesktopEnvironment, {
      clientSettingsPath: "/test/client-settings.json",
    } as DesktopEnvironment["Service"]),
    Effect.provideService(ElectronWindow, {
      currentMainOrFirst: Effect.succeedSome(main),
    } as ElectronWindow["Service"]),
    Effect.provideService(DesktopIpc, {
      handle: <E, R>(method: DesktopIpcMethod<E, R>) =>
        Effect.gen(function* () {
          const context = yield* Effect.context<R>();
          methods.set(method.channel, (value, event) =>
            method.handler(value, event).pipe(Effect.provide(context), Effect.orDie),
          );
        }),
      handleSync: () => Effect.void,
    }),
  );
  const invoke = (channel: string, value?: unknown, sender = 7) =>
    methods.get(channel)!(value, { sender: { id: sender } });
  const thread: DesktopNotificationThread = {
    environmentId: EnvironmentId.make("local"),
    threadId: ThreadId.make("thread"),
    threadTitle: "Test",
    projectTitle: "Project",
    environmentTitle: "Local",
    turnId: "turn",
    turnState: "running",
    completedAt: null,
    approval: false,
    input: false,
    archived: false,
    settled: false,
    snoozed: false,
    backgroundWorking: false,
    readState: "unknown",
    onScreen: false,
  };
  return {
    files,
    install: () => install,
    invoke,
    sync: (
      patch: Partial<DesktopNotificationThread> = {},
      notificationMode: NotificationMode = "notifications",
    ) =>
      invoke(Channels.SYNC_NOTIFICATIONS_CHANNEL, {
        notificationMode,
        environmentIds: [thread.environmentId],
        threads: [{ ...thread, ...patch }],
      }),
  };
}

describe("native desktop notification delivery", () => {
  it.effect(
    "keeps focused completions unread without popups and alerts for background completions",
    () =>
      Effect.gen(function* () {
        for (const focused of [true, false]) {
          const h = harness();
          yield* h.install();
          yield* h.sync();
          runtime.focused = focused;
          yield* h.sync({ turnState: "completed", completedAt: "2026-09-11T20:00:00.000Z" });
          expect(runtime.show).toHaveBeenCalledTimes(focused ? 0 : 1);
          const items = decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL));
          expect(items).toHaveLength(1);
          expect(items[0]).toMatchObject({ kind: "completed", read: false, resolved: false });
          expect(runtime.badge).toHaveBeenLastCalledWith(1);
          runtime.focused = !focused;
          yield* h.sync({ turnState: "completed", completedAt: "2026-09-11T20:00:00.000Z" });
          expect(runtime.show).toHaveBeenCalledTimes(focused ? 0 : 1);
        }
      }),
  );
  it.effect("keeps focused events in the inbox and uses native alerts while unfocused", () =>
    Effect.gen(function* () {
      const h = harness();
      yield* h.install();
      yield* h.sync();
      runtime.focused = true;
      yield* h.sync({ approval: true });
      expect(runtime.show).not.toHaveBeenCalled();
      expect(decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL))).toHaveLength(1);
      runtime.focused = false;
      runtime.sent.mockClear();
      yield* h.sync({ input: true });
      expect(runtime.show).toHaveBeenCalledOnce();
      expect(runtime.created[0]?.silent).toBe(true);
      expect(runtime.badge).toHaveBeenLastCalledWith(1);
    }),
  );
  it.effect("stores events without alerts when the selected mode excludes notifications", () =>
    Effect.gen(function* () {
      for (const mode of ["off", "sound"] as const) {
        const h = harness();
        yield* h.install();
        yield* h.sync({}, mode);
        yield* h.sync({ approval: true }, mode);
        expect(runtime.show).not.toHaveBeenCalled();
        expect(decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL))).toHaveLength(1);
      }
    }),
  );
  it.effect("persists reads, removes native entries, and prevents replay after restart", () =>
    Effect.gen(function* () {
      const h = harness();
      yield* h.install();
      yield* h.sync();
      yield* h.sync({ approval: true });
      const items = decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL));
      yield* h.invoke(Channels.UPDATE_NOTIFICATIONS_CHANNEL, { type: "read", ids: [items[0]!.id] });
      expect(runtime.remove).toHaveBeenCalledWith([items[0]!.id]);
      expect(runtime.badge).toHaveBeenLastCalledWith(0);
      yield* h.install();
      runtime.show.mockClear();
      yield* h.sync({ approval: true });
      expect(runtime.show).not.toHaveBeenCalled();
      const restored = decodeState(h.files.get("/test/notifications.json"));
      expect(restored.items[0]?.read).toBe(true);
    }),
  );
  it.effect("rejects notification changes from unrelated web contents", () =>
    Effect.gen(function* () {
      const h = harness();
      yield* h.install();
      yield* h.sync();
      yield* h.sync({ input: true });
      yield* h.invoke(
        Channels.UPDATE_NOTIFICATIONS_CHANNEL,
        { type: "read", ids: ["t3-work-1"] },
        99,
      );
      expect(runtime.badge).toHaveBeenLastCalledWith(1);
      expect(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL, undefined, 99)).toEqual([]);
    }),
  );
  it.effect("uses Windows toasts that open and close through the inbox", () =>
    Effect.gen(function* () {
      const h = harness("win32");
      yield* h.install();
      yield* h.sync({ threadTitle: 'Fix <b> & "quotes"' });
      yield* h.sync({ threadTitle: 'Fix <b> & "quotes"', input: true });
      const [item] = decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL));
      expect(runtime.created[0]?.toastXml).toContain(`launch="${item!.id}"`);
      expect(runtime.created[0]?.toastXml).toContain("Fix &lt;b&gt; &amp; &quot;quotes&quot;");
      // The renderer draws the Windows taskbar count; the Dock API is macOS only.
      expect(runtime.badge).not.toHaveBeenCalled();
      expect(runtime.remove).not.toHaveBeenCalled();

      runtime.activate!({ arguments: item!.id });
      // The open holds the inbox lock, so this read waits for it to finish.
      const [read] = decodeItems(yield* h.invoke(Channels.GET_NOTIFICATIONS_CHANNEL));
      expect(read?.read).toBe(true);
      expect(runtime.close).toHaveBeenCalledOnce();
      expect(runtime.sent).toHaveBeenCalledWith(
        Channels.NOTIFICATION_OPEN_CHANNEL,
        expect.objectContaining({ id: item!.id }),
      );
    }),
  );
});
