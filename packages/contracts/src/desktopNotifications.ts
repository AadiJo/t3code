import * as Schema from "effect/Schema";
import { EnvironmentId, ThreadId } from "./baseSchemas.ts";
import { NotificationMode } from "./settings.ts";

export const DesktopNotificationKind = Schema.Literals([
  "approval",
  "input",
  "failed",
  "completed",
]);
export type DesktopNotificationKind = typeof DesktopNotificationKind.Type;

export const DesktopNotification = Schema.Struct({
  id: Schema.String,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  kind: DesktopNotificationKind,
  threadTitle: Schema.String,
  projectTitle: Schema.String,
  environmentTitle: Schema.String,
  createdAt: Schema.String,
  read: Schema.Boolean,
  resolved: Schema.Boolean,
});
export type DesktopNotification = typeof DesktopNotification.Type;

export const DesktopNotificationThread = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  threadTitle: Schema.String,
  projectTitle: Schema.String,
  environmentTitle: Schema.String,
  turnId: Schema.NullOr(Schema.String),
  turnState: Schema.NullOr(Schema.Literals(["running", "interrupted", "completed", "error"])),
  completedAt: Schema.NullOr(Schema.String),
  approval: Schema.Boolean,
  input: Schema.Boolean,
  archived: Schema.Boolean,
  settled: Schema.Boolean,
  /** Hidden by a snooze that has neither elapsed nor been woken early. */
  snoozed: Schema.Boolean,
  /**
   * Background work that will wake the agent again is still running after
   * the turn (a Claude subagent fleet, an armed Monitor). Completions in this
   * state are not announced.
   */
  backgroundWorking: Schema.Boolean,
  /**
   * The shared visit time against the latest turn's end: `seen` once a client viewed it, `unread`
   * when the visit is older (the sidebar shows Done; a change without a new turn is a mark-unread),
   * and `unknown` without a visit, a finished turn, or visit tracking.
   */
  readState: Schema.Literals(["seen", "unread", "unknown"]),
  /**
   * Open in a focused window. Its new notifications are read as they arrive,
   * so the dock badge never counts work the reader is watching.
   */
  onScreen: Schema.Boolean,
});
export type DesktopNotificationThread = typeof DesktopNotificationThread.Type;

export const DesktopNotificationSnapshot = Schema.Struct({
  notificationMode: NotificationMode,
  // Only complete, connected environment snapshots can resolve missing threads.
  environmentIds: Schema.Array(EnvironmentId),
  threads: Schema.Array(DesktopNotificationThread),
});
export type DesktopNotificationSnapshot = typeof DesktopNotificationSnapshot.Type;

export const DesktopNotificationCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("read"), ids: Schema.Array(Schema.String) }),
  Schema.Struct({
    type: Schema.Literal("read-thread"),
    environmentId: EnvironmentId,
    threadId: ThreadId,
  }),
]);
export type DesktopNotificationCommand = typeof DesktopNotificationCommand.Type;

export const desktopNotificationTitles = {
  approval: "Approval required",
  input: "Input required",
  failed: "Turn failed",
  completed: "Turn completed",
} satisfies Record<DesktopNotificationKind, string>;
