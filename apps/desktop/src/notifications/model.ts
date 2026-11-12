import {
  DesktopNotification,
  type DesktopNotificationCommand,
  type DesktopNotificationKind,
  type DesktopNotificationSnapshot,
  DesktopNotificationThread,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const Signals = Schema.Struct({
  approval: Schema.NullOr(Schema.String),
  input: Schema.NullOr(Schema.String),
  failed: Schema.NullOr(Schema.String),
  completed: Schema.NullOr(Schema.String),
  // The thread's read state when last observed. Optional for state saved before it existed.
  readState: Schema.optionalKey(DesktopNotificationThread.fields.readState),
});
export const NotificationState = Schema.Struct({
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  observed: Schema.Record(Schema.String, Signals),
  items: Schema.Array(DesktopNotification),
});
export type NotificationState = typeof NotificationState.Type;
export const emptyNotificationState = (): NotificationState => ({
  sequence: 0,
  observed: {},
  items: [],
});
const kinds = ["approval", "input", "failed", "completed"] as const;
const key = (environmentId: string, threadId: string) => JSON.stringify([environmentId, threadId]);
const isTurnEnd = (kind: DesktopNotificationKind) => kind === "completed" || kind === "failed";
// A turn end that any client has seen is read here too. Approvals and
// questions still wait for an answer, so seeing them changes nothing.
const seenTurnEnd = (thread: DesktopNotificationThread, kind: DesktopNotificationKind) =>
  thread.readState === "seen" && isTurnEnd(kind);
// Marked unread on some client: the same turn end became unread. Only that
// change counts, not an unread state, so a read here stays read while its own
// visit is still on the way to the server. State saved before read states
// were observed records one first instead of reacting to it.
const markedUnread = (
  previous: typeof Signals.Type | undefined,
  next: typeof Signals.Type,
  kind: DesktopNotificationKind,
) =>
  isTurnEnd(kind) &&
  next[kind] !== null &&
  next[kind] === previous?.[kind] &&
  previous.readState !== undefined &&
  previous.readState !== "unread" &&
  next.readState === "unread";

function signals(thread: DesktopNotificationThread): typeof Signals.Type {
  const turn = thread.turnId ?? "session";
  return {
    approval: !thread.archived && thread.approval ? turn : null,
    input: !thread.archived && thread.input ? turn : null,
    failed: !thread.archived && thread.turnState === "error" ? turn : null,
    completed:
      !thread.archived && thread.turnState === "completed" && thread.completedAt
        ? `${turn}:${thread.completedAt}`
        : null,
    readState: thread.readState,
  };
}

/** Reconcile current thread conditions. The first observation establishes a silent baseline. */
export function reconcileNotifications(
  state: NotificationState,
  snapshot: DesktopNotificationSnapshot,
  now: string,
) {
  const observed = { ...state.observed };
  let sequence = state.sequence;
  let changed = false;
  const added: DesktopNotification[] = [];
  const created: DesktopNotification[] = [];
  const create = (
    thread: DesktopNotificationThread,
    kind: DesktopNotificationKind,
    read: boolean,
  ) => {
    const item: DesktopNotification = {
      id: `t3-work-${++sequence}`,
      environmentId: thread.environmentId,
      threadId: thread.threadId,
      kind,
      threadTitle: thread.threadTitle,
      projectTitle: thread.projectTitle,
      environmentTitle: thread.environmentTitle,
      createdAt: now,
      read,
      resolved: false,
    };
    created.unshift(item);
    return item;
  };
  const environments = new Set<string>(snapshot.environmentIds);
  const current = new Map(
    snapshot.threads
      .filter((thread) => environments.has(thread.environmentId))
      .map((thread) => [
        key(thread.environmentId, thread.threadId),
        { thread, signals: signals(thread) },
      ]),
  );
  for (const [threadKey, { thread, signals: next }] of current) {
    const previous = observed[threadKey];
    if (
      !previous ||
      next.readState !== previous.readState ||
      kinds.some((kind) => next[kind] !== previous[kind])
    )
      changed = true;
    observed[threadKey] = next;
    // Keep the baseline while settled so reopening cannot replay old completions.
    if (thread.settled) continue;
    for (const kind of kinds) {
      if (next[kind] === null || next[kind] === previous?.[kind]) continue;
      // Initial completions are history. Pending questions still belong in the inbox.
      if (!previous && (kind === "completed" || kind === "failed")) continue;
      // A main turn that ends while subagents run is not the finish. The
      // baseline above still records it, so the moment the last subagent
      // stops (before the agent wakes) cannot replay it as new.
      if (kind === "completed" && thread.backgroundWorking) continue;
      const read = thread.onScreen || seenTurnEnd(thread, kind);
      const item = create(thread, kind, read);
      if (previous && !read) added.push(item);
    }
    // A mark-unread brings the turn end's notification back (below). Without
    // one (pruned history, or a turn that ended before this app ran), a silent
    // entry carries the badge. Nothing is announced either way.
    const turnEnd = next.completed !== null ? "completed" : next.failed !== null ? "failed" : null;
    if (
      turnEnd !== null &&
      !thread.snoozed &&
      markedUnread(previous, next, turnEnd) &&
      !state.items.some(
        (item) =>
          !item.resolved &&
          item.kind === turnEnd &&
          item.environmentId === thread.environmentId &&
          item.threadId === thread.threadId,
      )
    )
      create(thread, turnEnd, false);
  }
  let items = state.items.map((item) => {
    if (!environments.has(item.environmentId)) return item;
    const threadKey = key(item.environmentId, item.threadId);
    const entry = current.get(threadKey);
    const previous = state.observed[threadKey];
    // Settling or snoozing a thread is the user setting it aside, so its
    // pending notifications are read. A snooze still observes new signals:
    // anything that wakes the thread early arrives as a fresh notification.
    const resolved =
      item.resolved ||
      !entry ||
      entry.thread.settled ||
      entry.thread.snoozed ||
      entry.signals[item.kind] === null ||
      (previous !== undefined && entry.signals[item.kind] !== previous[item.kind]);
    // The badge returns; the banner does not, because nothing is added.
    const unread =
      !resolved && entry !== undefined && markedUnread(previous, entry.signals, item.kind);
    const read =
      !unread &&
      (item.read || resolved || (entry !== undefined && seenTurnEnd(entry.thread, item.kind)));
    const threadTitle = entry?.thread.threadTitle ?? item.threadTitle;
    const projectTitle = entry?.thread.projectTitle ?? item.projectTitle;
    const environmentTitle = entry?.thread.environmentTitle ?? item.environmentTitle;
    if (
      resolved === item.resolved &&
      read === item.read &&
      threadTitle === item.threadTitle &&
      projectTitle === item.projectTitle &&
      environmentTitle === item.environmentTitle
    )
      return item;
    changed = true;
    return {
      ...item,
      threadTitle,
      projectTitle,
      environmentTitle,
      resolved,
      read,
    };
  });
  items = [...created, ...items];
  // Bound retained history, without dropping unread attention items.
  let historyCount = 0;
  items = items.filter((item) => !item.read || ++historyCount <= 200);
  const next: NotificationState = { sequence, observed, items };
  return {
    state: changed || created.length > 0 || items.length !== state.items.length ? next : state,
    added,
  };
}

export function readNotifications(
  state: NotificationState,
  command: DesktopNotificationCommand,
): NotificationState {
  const ids = command.type === "read" ? new Set(command.ids) : null;
  let changed = false;
  const items = state.items.map((item) => {
    const matches =
      command.type === "read"
        ? ids!.has(item.id)
        : item.environmentId === command.environmentId && item.threadId === command.threadId;
    if (!matches || item.read) return item;
    changed = true;
    return { ...item, read: true };
  });
  return changed ? { ...state, items } : state;
}
