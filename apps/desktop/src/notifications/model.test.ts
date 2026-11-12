import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, type DesktopNotificationThread } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  emptyNotificationState,
  NotificationState,
  readNotifications,
  reconcileNotifications,
} from "./model.ts";

const environmentId = EnvironmentId.make("local");
const threadId = ThreadId.make("thread");
const now = "2026-09-11T20:00:00.000Z";
const thread = (patch: Partial<DesktopNotificationThread> = {}): DesktopNotificationThread => ({
  environmentId,
  threadId,
  threadTitle: "Test thread",
  projectTitle: "Test project",
  environmentTitle: "Local",
  turnId: "turn-1",
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
  ...patch,
});
const snapshot = (...threads: DesktopNotificationThread[]) => ({
  notificationMode: "notifications" as const,
  environmentIds: [environmentId],
  threads,
});
const baseline = () =>
  reconcileNotifications(emptyNotificationState(), snapshot(thread()), now).state;

describe("desktop notification lifecycle", () => {
  it("silently records completions during settlement and does not replay them on reopen", () => {
    const completed = thread({ turnState: "completed", completedAt: now, settled: true });
    const settled = reconcileNotifications(baseline(), snapshot(completed), now);
    expect(settled.added).toEqual([]);
    expect(settled.state.items).toEqual([]);
    const reopened = reconcileNotifications(
      settled.state,
      snapshot({ ...completed, settled: false }),
      now,
    );
    expect(reopened.added).toEqual([]);
    expect(reopened.state.items).toEqual([]);
    const next = reconcileNotifications(
      reopened.state,
      snapshot(
        thread({
          turnId: "turn-2",
          turnState: "completed",
          completedAt: "2026-09-11T21:00:00.000Z",
        }),
      ),
      now,
    );
    expect(next.added).toHaveLength(1);
  });

  it("resolves unread notifications when a thread settles", () => {
    const completed = thread({ turnState: "completed", completedAt: now });
    const first = reconcileNotifications(baseline(), snapshot(completed), now);
    const settled = reconcileNotifications(
      first.state,
      snapshot({ ...completed, settled: true }),
      now,
    );
    expect(settled.added).toEqual([]);
    expect(settled.state.items[0]).toMatchObject({ read: true, resolved: true });
  });

  it("resolves unread notifications when a thread is snoozed and alerts again when it wakes", () => {
    const completed = thread({ turnState: "completed", completedAt: now });
    const first = reconcileNotifications(baseline(), snapshot(completed), now);
    const snoozed = reconcileNotifications(
      first.state,
      snapshot({ ...completed, snoozed: true }),
      now,
    );
    expect(snoozed.added).toEqual([]);
    expect(snoozed.state.items[0]).toMatchObject({ read: true, resolved: true });
    // A completion during the snooze wakes the thread, so the client reports
    // it as no longer snoozed and the inbox alerts for it.
    const woke = reconcileNotifications(
      snoozed.state,
      snapshot(
        thread({
          turnId: "turn-2",
          turnState: "completed",
          completedAt: "2026-09-11T21:00:00.000Z",
        }),
      ),
      now,
    );
    expect(woke.added).toHaveLength(1);
    expect(woke.state.items[0]).toMatchObject({ kind: "completed", read: false });
  });

  it("records completions silently while subagents run and alerts on the final one", () => {
    const fleet = thread({
      turnState: "completed",
      completedAt: "2026-09-11T20:05:00.000Z",
      backgroundWorking: true,
    });
    const launched = reconcileNotifications(baseline(), snapshot(fleet), now);
    expect(launched.added).toEqual([]);
    // The last subagent stops before the main agent wakes: no replay.
    const gap = reconcileNotifications(
      launched.state,
      snapshot({ ...fleet, backgroundWorking: false }),
      now,
    );
    expect(gap.added).toEqual([]);
    const finished = reconcileNotifications(
      gap.state,
      snapshot(
        thread({
          turnId: "turn-2",
          turnState: "completed",
          completedAt: "2026-09-11T20:30:00.000Z",
        }),
      ),
      now,
    );
    expect(finished.added).toHaveLength(1);
    expect(finished.added[0]).toMatchObject({ kind: "completed", read: false });
  });

  it("reads turn ends that another client has seen but keeps pending questions", () => {
    const completed = thread({ turnState: "completed", completedAt: now });
    const first = reconcileNotifications(baseline(), snapshot(completed), now);
    expect(first.state.items[0]).toMatchObject({ kind: "completed", read: false });
    const seen = reconcileNotifications(
      first.state,
      snapshot({ ...completed, readState: "seen" }),
      now,
    );
    expect(seen.added).toEqual([]);
    expect(seen.state.items[0]).toMatchObject({ read: true, resolved: false });

    const asking = thread({ input: true });
    const pending = reconcileNotifications(baseline(), snapshot(asking), now);
    const viewed = reconcileNotifications(
      pending.state,
      snapshot({ ...asking, readState: "seen" }),
      now,
    );
    expect(viewed.state.items[0]).toMatchObject({ kind: "input", read: false });
  });

  it("reads new work in the thread on screen so it never reaches the badge", () => {
    const watching = thread({ onScreen: true });
    const finished = reconcileNotifications(
      reconcileNotifications(emptyNotificationState(), snapshot(watching), now).state,
      snapshot({ ...watching, turnState: "completed", completedAt: now, approval: true }),
      now,
    );
    expect(finished.added).toEqual([]);
    expect(finished.state.items.map(({ kind, read }) => ({ kind, read }))).toEqual([
      { kind: "completed", read: true },
      { kind: "approval", read: true },
    ]);
  });

  it("brings the badge back without a banner when a client marks the thread unread", () => {
    const completed = thread({ turnState: "completed", completedAt: now });
    const first = reconcileNotifications(baseline(), snapshot(completed), now);
    // Read here while this client's visit is still on the way to the server.
    const readHere = readNotifications(first.state, {
      type: "read-thread",
      environmentId,
      threadId,
    });
    const inFlight = reconcileNotifications(readHere, snapshot(completed), now);
    expect(inFlight.state.items[0]).toMatchObject({ read: true });
    const seen = reconcileNotifications(
      inFlight.state,
      snapshot({ ...completed, readState: "seen" }),
      now,
    );
    const markedUnread = reconcileNotifications(
      seen.state,
      snapshot({ ...completed, readState: "unread" }),
      now,
    );
    expect(markedUnread.added).toEqual([]);
    expect(markedUnread.state.items[0]).toMatchObject({ read: false, resolved: false });
    // A new turn also ends unread, but it replaces the old notification.
    const nextTurn = reconcileNotifications(
      seen.state,
      snapshot(
        thread({
          turnId: "turn-2",
          turnState: "completed",
          completedAt: "2026-09-11T21:00:00.000Z",
          readState: "unread",
        }),
      ),
      now,
    );
    expect(nextTurn.added).toHaveLength(1);
    expect(nextTurn.state.items).toMatchObject([
      { read: false, resolved: false },
      { read: true, resolved: true },
    ]);
  });

  it("adds a silent unread entry when a turn end without a notification is marked unread", () => {
    for (const before of ["seen", "unknown"] as const) {
      const completed = thread({ turnState: "completed", completedAt: now, readState: before });
      // The first observation is history, so there is no notification to bring back.
      const history = reconcileNotifications(emptyNotificationState(), snapshot(completed), now);
      expect(history.state.items).toEqual([]);
      const markedUnread = reconcileNotifications(
        history.state,
        snapshot({ ...completed, readState: "unread" }),
        now,
      );
      expect(markedUnread.added).toEqual([]);
      expect(markedUnread.state.items).toMatchObject([
        { kind: "completed", read: false, resolved: false },
      ]);
      const visited = reconcileNotifications(
        markedUnread.state,
        snapshot({ ...completed, readState: "seen" }),
        now,
      );
      expect(visited.state.items[0]).toMatchObject({ read: true });
    }
  });

  it("records the read state instead of reacting when saved state predates it", () => {
    const completed = thread({ turnState: "completed", completedAt: now, readState: "seen" });
    const history = reconcileNotifications(emptyNotificationState(), snapshot(completed), now);
    const saved: NotificationState = {
      ...history.state,
      observed: Object.fromEntries(
        Object.entries(history.state.observed).map(
          ([threadKey, { approval, input, failed, completed: done }]) => [
            threadKey,
            { approval, input, failed, completed: done },
          ],
        ),
      ),
    };
    const next = reconcileNotifications(
      saved,
      snapshot({ ...completed, readState: "unread" }),
      now,
    );
    expect(next.state.items).toEqual([]);
  });

  it("records a turn end already seen elsewhere as read without announcing it", () => {
    for (const patch of [
      { turnState: "error" as const },
      { turnState: "completed" as const, completedAt: now },
    ]) {
      const next = reconcileNotifications(
        baseline(),
        snapshot(thread({ ...patch, readState: "seen" })),
        now,
      );
      expect(next.added).toEqual([]);
      expect(next.state.items[0]).toMatchObject({ read: true });
    }
  });

  it("alerts once for each attention and terminal transition", () => {
    for (const patch of [
      { approval: true },
      { input: true },
      { turnState: "error" as const },
      { turnState: "completed" as const, completedAt: now },
    ]) {
      const first = reconcileNotifications(baseline(), snapshot(thread(patch)), now);
      expect(first.added).toHaveLength(1);
      expect(first.state.items[0]?.read).toBe(false);
      const replay = reconcileNotifications(first.state, snapshot(thread(patch)), now);
      expect(replay.added).toEqual([]);
      expect(replay.state).toBe(first.state);
    }
  });
  it("does not announce historical completions and silently restores pending input", () => {
    const result = reconcileNotifications(
      emptyNotificationState(),
      snapshot(thread({ turnState: "completed", completedAt: now })),
      now,
    );
    expect(result.state.items).toEqual([]);
    const pending = reconcileNotifications(
      emptyNotificationState(),
      snapshot(thread({ input: true })),
      now,
    );
    expect(pending.added).toEqual([]);
    expect(pending.state.items[0]).toMatchObject({ kind: "input", read: false });
  });
  it("keeps read state after persistence and reconnect", () => {
    const first = reconcileNotifications(baseline(), snapshot(thread({ approval: true })), now);
    const read = readNotifications(first.state, { type: "read-thread", environmentId, threadId });
    const encode = Schema.encodeSync(Schema.fromJsonString(NotificationState));
    const decode = Schema.decodeUnknownSync(Schema.fromJsonString(NotificationState));
    const restored = decode(encode(read));
    const replay = reconcileNotifications(restored, snapshot(thread({ approval: true })), now);
    expect(replay.added).toEqual([]);
    expect(replay.state.items[0]).toMatchObject({ read: true, resolved: false });
  });
  it("resolves old attention and creates a distinct notification for a new request in the same turn", () => {
    const first = reconcileNotifications(baseline(), snapshot(thread({ approval: true })), now);
    const resolved = reconcileNotifications(first.state, snapshot(thread()), now);
    expect(resolved.state.items[0]).toMatchObject({ read: true, resolved: true });
    const next = reconcileNotifications(resolved.state, snapshot(thread({ approval: true })), now);
    expect(next.added).toHaveLength(1);
    expect(next.added[0]?.id).not.toBe(first.added[0]?.id);
  });
  it("replaces a pending request when work completes", () => {
    const first = reconcileNotifications(baseline(), snapshot(thread({ input: true })), now);
    const done = reconcileNotifications(
      first.state,
      snapshot(thread({ turnState: "completed", completedAt: now })),
      now,
    );
    expect(done.state.items.filter((item) => !item.read).map((item) => item.kind)).toEqual([
      "completed",
    ]);
    expect(done.state.items.find((item) => item.kind === "input")?.resolved).toBe(true);
  });
  it("replaces an unread completion when the same thread completes again", () => {
    const first = reconcileNotifications(
      baseline(),
      snapshot(thread({ turnState: "completed", completedAt: now })),
      now,
    );
    const later = "2026-09-11T20:05:00.000Z";
    const second = reconcileNotifications(
      first.state,
      snapshot(thread({ turnId: "turn-2", turnState: "completed", completedAt: later })),
      later,
    );
    expect(second.added.map((item) => item.kind)).toEqual(["completed"]);
    const unread = second.state.items.filter((item) => !item.read);
    expect(unread).toHaveLength(1);
    expect(unread[0]?.createdAt).toBe(later);
    expect(second.state.items.find((item) => item.id === first.added[0]?.id)).toMatchObject({
      read: true,
      resolved: true,
    });
  });
  it("does not resolve offline environments, but resolves deleted and archived threads", () => {
    const first = reconcileNotifications(baseline(), snapshot(thread({ approval: true })), now);
    expect(
      reconcileNotifications(
        first.state,
        { notificationMode: "notifications", environmentIds: [], threads: [] },
        now,
      ).state,
    ).toBe(first.state);
    expect(reconcileNotifications(first.state, snapshot(), now).state.items[0]?.resolved).toBe(
      true,
    );
    expect(
      reconcileNotifications(first.state, snapshot(thread({ approval: true, archived: true })), now)
        .state.items[0]?.resolved,
    ).toBe(true);
  });
  it("scopes reads to the environment and does not replay read notifications", () => {
    const remote = EnvironmentId.make("remote");
    const initial = reconcileNotifications(
      emptyNotificationState(),
      {
        notificationMode: "notifications",
        environmentIds: [environmentId, remote],
        threads: [thread(), thread({ environmentId: remote })],
      },
      now,
    );
    const next = reconcileNotifications(
      initial.state,
      {
        notificationMode: "notifications",
        environmentIds: [environmentId, remote],
        threads: [thread({ input: true }), thread({ environmentId: remote, input: true })],
      },
      now,
    );
    const read = readNotifications(next.state, { type: "read-thread", environmentId, threadId });
    expect(read.items.filter((item) => !item.read).map((item) => item.environmentId)).toEqual([
      remote,
    ]);
  });
});
