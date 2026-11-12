import { useAtomValue } from "@effect/atom-react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import type {
  DesktopNotification,
  DesktopNotificationThread,
  EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  deriveAcknowledgedCompletions,
  desktopTurnState,
  latestRunReadState,
  notificationBridge,
  updateDesktopNotifications,
  useDesktopNotifications,
} from "../../desktopNotifications";
import { useAcknowledgeThreadWoke } from "../../hooks/useThreadActions";
import { readThreadShell } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { environmentShell } from "../../state/shell";
import { resolveThreadRouteRef } from "../../threadRoutes";
import { useClientSettings } from "../../hooks/useSettings";
import { resolveSidebarThreadStatus } from "../Sidebar.logic";

function EnvironmentNotifications({
  environmentId,
  label,
  onScreenThreadId,
}: {
  environmentId: EnvironmentId;
  label: string;
  /** The thread open in this window while it has focus, if it is in this environment. */
  onScreenThreadId: ThreadId | null;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  const notificationMode = useClientSettings((settings) => settings.notificationMode);
  const lastSent = useRef("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes this environment's notification state to the Electron main process over IPC
  useEffect(() => {
    if (shell.status !== "live" || Option.isNone(shell.snapshot)) return;
    const snapshot = shell.snapshot.value;
    const projects = new Map(snapshot.projects.map((project) => [project.id, project.title]));
    const now = new Date().toISOString();
    const payload = {
      notificationMode,
      environmentIds: [environmentId],
      threads: snapshot.threads.flatMap((rawThread): DesktopNotificationThread[] => {
        if (rawThread.lineage.relationshipToParent === "subagent") return [];
        const thread = presentThreadShell(environmentId, rawThread);
        const status = resolveSidebarThreadStatus(thread);
        const turnState = desktopTurnState(thread.latestRun, status);
        return [
          {
            environmentId,
            threadId: thread.id,
            threadTitle: thread.title,
            projectTitle: projects.get(thread.projectId) ?? "Project",
            environmentTitle: label,
            turnId: thread.latestRun?.runId ?? null,
            turnState,
            completedAt: turnState === "completed" ? (thread.latestRun?.completedAt ?? null) : null,
            approval: thread.hasPendingApprovals,
            input: thread.hasPendingUserInput,
            archived: thread.archivedAt !== null,
            settled: thread.settledOverride === "settled",
            snoozed: effectiveSnoozed(thread, { now }),
            backgroundWorking: status === "waiting",
            readState: latestRunReadState(thread),
            onScreen: thread.id === onScreenThreadId,
          },
        ];
      }),
    };
    // Shell updates can include progress. Only send notification-relevant changes over IPC.
    const identity = JSON.stringify(payload);
    if (identity === lastSent.current) return;
    lastSent.current = identity;
    void notificationBridge()
      ?.syncNotifications?.(payload)
      .catch((error) => {
        lastSent.current = "";
        console.error("Could not synchronize notifications.", error);
      });
  }, [shell, environmentId, label, notificationMode, onScreenThreadId]);
  return null;
}

export function DesktopNotificationCoordinator() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const thread = resolveThreadRouteRef(params);
  const environmentId = thread?.environmentId;
  const threadId = thread?.threadId;
  const { environments } = useEnvironments();
  const items = useDesktopNotifications((state) => state.items);
  const ready = useDesktopNotifications((state) => state.ready);
  const recordThreadVisit = useAcknowledgeThreadWoke();
  const previousItems = useRef(items);
  // Notifications a mark-unread made unread again. Being on screen does not
  // read them, so the mark stays until the thread is opened again.
  const markedUnreadIds = useRef(new Set<string>());
  // The sidebar's Done badge follows the inbox: a completion read there, or
  // read because the thread was settled or snoozed, counts as a visit.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- inbox items arrive over IPC, so their reads have no handler here
  useEffect(() => {
    const previous = previousItems.current;
    previousItems.current = items;
    const wasRead = new Set(previous.filter((item) => item.read).map((item) => item.id));
    for (const item of items) {
      if (item.read) markedUnreadIds.current.delete(item.id);
      else if (wasRead.has(item.id)) markedUnreadIds.current.add(item.id);
    }
    for (const { thread, visitedAt } of deriveAcknowledgedCompletions(
      previous,
      items,
      (ref) => readThreadShell(ref)?.latestRun?.completedAt,
    )) {
      // Already seen on the server (often read on another client): another
      // visit would only broadcast a redundant event.
      const shell = readThreadShell(thread);
      if (shell && latestRunReadState(shell) === "seen") continue;
      recordThreadVisit(thread, visitedAt);
    }
  }, [items, recordThreadVisit]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the route change is the thread open that clears its mark-unread memory
  useEffect(() => {
    // Opening a thread reads it, including a mark-unread left from before.
    markedUnreadIds.current.clear();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- The route change is the open that clears the marks.
  }, [environmentId, threadId]);
  const [focused, setFocused] = useState(() => document.hasFocus());
  const open = (item: DesktopNotification) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: item.environmentId, threadId: item.threadId },
    });
    void updateDesktopNotifications({ type: "read", ids: [item.id] }).catch(console.error);
  };
  const openFromNotification = useEffectEvent(open);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the desktop bridge and window focus while mounted
  useEffect(() => {
    const bridge = notificationBridge();
    if (!bridge) return;
    let active = true;
    let received = false;
    const unsubscribe = bridge.onNotifications?.((next) => {
      received = true;
      useDesktopNotifications.setState({ items: next, ready: true });
    });
    const unsubscribeOpen = bridge.onNotificationOpen?.((item) => openFromNotification(item));
    void bridge
      .getNotifications?.()
      .then((next) => {
        if (active && !received) useDesktopNotifications.setState({ items: next, ready: true });
      })
      .catch((error) => console.error("Could not load notifications.", error));
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    return () => {
      active = false;
      unsubscribe?.();
      unsubscribeOpen?.();
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
    };
  }, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- marks the open thread read in the desktop inbox while the window has focus
  useEffect(() => {
    if (!focused || !environmentId || !threadId) return;
    const ids = items
      .filter(
        (item) =>
          !item.read &&
          item.environmentId === environmentId &&
          item.threadId === threadId &&
          !markedUnreadIds.current.has(item.id),
      )
      .map((item) => item.id);
    if (ids.length === 0) return;
    void updateDesktopNotifications({ type: "read", ids }).catch(console.error);
  }, [items, focused, environmentId, threadId]);
  if (!notificationBridge() || !ready) return null;
  return environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => (
      <EnvironmentNotifications
        key={environment.environmentId}
        environmentId={environment.environmentId}
        label={environment.label}
        onScreenThreadId={
          focused && environment.environmentId === environmentId ? (threadId ?? null) : null
        }
      />
    ));
}
