import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, RunId, ThreadId, type DesktopNotification } from "@t3tools/contracts";
import {
  deriveAcknowledgedCompletions,
  desktopTurnState,
  hasUnreadDesktopCompletion,
  latestRunReadState,
} from "./desktopNotifications";
import { hasUnseenCompletion, resolveThreadStatusPill } from "./components/Sidebar.logic";

const threadRef = { environmentId: EnvironmentId.make("local"), threadId: ThreadId.make("thread") };
const completion: DesktopNotification = {
  ...threadRef,
  id: "completion",
  kind: "completed",
  threadTitle: "Task",
  projectTitle: "Project",
  environmentTitle: "Local",
  createdAt: "2026-09-11T20:00:00.000Z",
  read: false,
  resolved: false,
};
const status = {
  latestRun: null,
  lastVisitedAt: undefined,
  runtime: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  interactionMode: "default" as const,
};

describe("notification-backed Done indicator", () => {
  it("shows completion without a timestamp and clears it when the notification is read", () => {
    for (const read of [false, true]) {
      const input = {
        ...status,
        hasUnreadCompletionNotification: hasUnreadDesktopCompletion(
          [{ ...completion, read }],
          threadRef,
        ),
      };
      expect(hasUnseenCompletion(input)).toBe(!read);
      expect(resolveThreadStatusPill({ thread: input })?.label ?? null).toBe(
        read ? null : "Completed",
      );
    }
  });

  it("keeps Done while a resolved completion is still unread in the inbox", () => {
    const input = {
      ...status,
      hasUnreadCompletionNotification: hasUnreadDesktopCompletion(
        [{ ...completion, resolved: true }],
        threadRef,
      ),
    };
    expect(hasUnseenCompletion(input)).toBe(true);
    expect(resolveThreadStatusPill({ thread: input })?.label).toBe("Completed");
  });

  it("ignores unrelated and non-completion notifications", () => {
    for (const item of [
      { ...completion, environmentId: EnvironmentId.make("remote") },
      { ...completion, threadId: ThreadId.make("other") },
      { ...completion, kind: "approval" as const },
    ])
      expect(hasUnreadDesktopCompletion([item], threadRef)).toBe(false);
  });

  it("clears Done for a thread once its completion notification is read", () => {
    const later = "2026-09-11T20:05:00.000Z";
    // A read that lands with a newer completion stamps the visit at that
    // completion, so the badge clears; without one the notification time is
    // what the user acknowledged.
    expect(
      deriveAcknowledgedCompletions([completion], [{ ...completion, read: true }], () => later),
    ).toEqual([{ thread: threadRef, visitedAt: later }]);
    expect(
      deriveAcknowledgedCompletions([completion], [{ ...completion, read: true }], () => null),
    ).toEqual([{ thread: threadRef, visitedAt: completion.createdAt }]);
    // Items that were already read, are still unread, or belong to other
    // kinds acknowledge nothing.
    expect(
      deriveAcknowledgedCompletions(
        [
          { ...completion, read: true },
          { ...completion, id: "approval", kind: "approval" },
        ],
        [
          { ...completion, read: true },
          { ...completion, id: "approval", kind: "approval", read: true },
        ],
        () => later,
      ),
    ).toEqual([]);
    // Reading one completion while another for the same thread stays unread
    // keeps the badge.
    const second = { ...completion, id: "completion-2" };
    expect(
      deriveAcknowledgedCompletions(
        [completion, second],
        [{ ...completion, read: true }, second],
        () => later,
      ),
    ).toEqual([]);
  });

  it("keeps active work and attention requests ahead of an old completion", () => {
    for (const [patch, label] of [
      [{ hasPendingApprovals: true }, "Pending Approval"],
      [{ hasPendingUserInput: true }, "Awaiting Input"],
      [{ pendingBackgroundTasks: [{ taskId: "agent", kind: "subagent" as const }] }, "Waiting"],
    ] as const) {
      expect(
        resolveThreadStatusPill({
          thread: { ...status, ...patch, hasUnreadCompletionNotification: true },
        })?.label,
      ).toBe(label);
    }
  });
});

describe("server read state of the latest turn end", () => {
  const run = { completedAt: "2026-09-11T20:00:00.000Z" };
  const state = (
    lastVisitedAt: string | null | undefined,
    latestRun: { readonly completedAt: string | null } | null = run,
  ) => latestRunReadState({ latestRun, lastVisitedAt });

  it("is seen once the shared visit time reaches the turn end and unread before it", () => {
    expect(state("2026-09-11T19:59:59.999Z")).toBe("unread");
    expect(state(run.completedAt)).toBe("seen");
    expect(state("2026-09-11T20:05:00.000Z")).toBe("seen");
  });

  it("is unknown without visit tracking, a visit, or a finished run", () => {
    expect(state(undefined)).toBe("unknown");
    expect(state(null)).toBe("unknown");
    expect(state(run.completedAt, { completedAt: null })).toBe("unknown");
    expect(state(run.completedAt, null)).toBe("unknown");
  });
});

describe("desktop turn state", () => {
  const completed = {
    runId: RunId.make("run"),
    status: "completed" as const,
    requestedAt: null,
    startedAt: null,
    completedAt: "2026-09-11T20:00:00.000Z",
    assistantMessageId: null,
  };

  it("keeps a completion held by background work as completed so its end cannot replay it", () => {
    expect(desktopTurnState(completed, "ready")).toBe("completed");
    expect(desktopTurnState(completed, "waiting")).toBe("completed");
    // A queued message that sends by itself means the agent continues.
    expect(desktopTurnState(completed, "working")).toBe("running");
    expect(desktopTurnState({ ...completed, status: "failed" }, "ready")).toBe("error");
    expect(desktopTurnState(null, "ready")).toBeNull();
  });
});
