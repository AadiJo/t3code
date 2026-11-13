import type {
  DesktopNotification,
  DesktopNotificationCommand,
  DesktopNotificationThread,
  ScopedThreadRef,
} from "@t3tools/contracts";
import type { ThreadRunSummary } from "@t3tools/client-runtime/state/models";
import { create } from "zustand";
import type { SidebarThreadStatus } from "./components/Sidebar.logic";

export const useDesktopNotifications = create<{
  items: readonly DesktopNotification[];
  ready: boolean;
}>(() => ({ items: [], ready: false }));

/** The desktop notification inbox, on the platforms where the app runs one (macOS, Windows). */
export function notificationBridge() {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const platform = bridge?.getClientPlatform?.();
  return (platform === "darwin" || platform === "win32") && bridge?.syncNotifications
    ? bridge
    : undefined;
}

export async function updateDesktopNotifications(command: DesktopNotificationCommand) {
  await notificationBridge()?.updateNotifications?.(command);
}

export function hasUnreadDesktopCompletion(
  items: readonly DesktopNotification[],
  thread: ScopedThreadRef,
): boolean {
  return items.some(
    (item) =>
      item.kind === "completed" &&
      !item.read &&
      item.environmentId === thread.environmentId &&
      item.threadId === thread.threadId,
  );
}

/**
 * The server's read state for how the latest run ended, by the sidebar's Done
 * check without this desktop's notifications: `unread` is exactly when Done
 * shows. Servers without visit tracking omit `lastVisitedAt`, and a thread
 * never visited has none, so both are `unknown`.
 */
export function latestRunReadState(thread: {
  readonly latestRun: { readonly completedAt: string | null } | null;
  readonly lastVisitedAt?: string | null | undefined;
}): DesktopNotificationThread["readState"] {
  const completedAt = thread.latestRun?.completedAt;
  if (!completedAt || !thread.lastVisitedAt) return "unknown";
  const completedMs = Date.parse(completedAt);
  const visitedMs = Date.parse(thread.lastVisitedAt);
  if (!Number.isFinite(completedMs) || !Number.isFinite(visitedMs)) return "unknown";
  return visitedMs >= completedMs ? "seen" : "unread";
}

/**
 * The latest run as the desktop inbox sees it. Work the agent waits on holds the alert
 * (`backgroundWorking`), and a self-sending queued message is already the latest run. A held
 * completion still reads as completed, so the inbox records it and its end cannot announce it.
 */
export function desktopTurnState(
  run: ThreadRunSummary | null,
  status: SidebarThreadStatus,
): DesktopNotificationThread["turnState"] {
  if (run === null) return null;
  switch (run.status) {
    case "completed":
      return status === "ready" || status === "waiting" ? "completed" : "running";
    case "failed":
      return "error";
    case "interrupted":
    case "cancelled":
    case "rolled_back":
      return "interrupted";
    default:
      return "running";
  }
}

export function useUnreadDesktopCompletion(thread: ScopedThreadRef): boolean {
  return useDesktopNotifications((state) => hasUnreadDesktopCompletion(state.items, thread));
}

/**
 * Threads whose last unread completion was just read, with the visit time that clears their Done
 * badge. Every read path marks the desktop inbox, so the badge follows the inbox. The time is the
 * later of the notification and the current completion, so a newer completion still shows.
 */
export function deriveAcknowledgedCompletions(
  previous: readonly DesktopNotification[],
  next: readonly DesktopNotification[],
  readCompletedAt: (thread: ScopedThreadRef) => string | null | undefined,
): Array<{ thread: ScopedThreadRef; visitedAt: string }> {
  const previouslyUnread = new Set(
    previous.filter((item) => item.kind === "completed" && !item.read).map((item) => item.id),
  );
  const acknowledged = new Map<string, { thread: ScopedThreadRef; visitedAt: string }>();
  for (const item of next) {
    if (item.kind !== "completed" || !item.read || !previouslyUnread.has(item.id)) continue;
    const thread = { environmentId: item.environmentId, threadId: item.threadId };
    const key = `${item.environmentId}\u0000${item.threadId}`;
    if (acknowledged.has(key) || hasUnreadDesktopCompletion(next, thread)) continue;
    const completedAt = readCompletedAt(thread);
    const visitedAt =
      completedAt && Date.parse(completedAt) > Date.parse(item.createdAt)
        ? completedAt
        : item.createdAt;
    acknowledged.set(key, { thread, visitedAt });
  }
  return [...acknowledged.values()];
}
