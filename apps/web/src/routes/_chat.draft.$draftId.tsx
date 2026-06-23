import { scopeProjectRef } from "@t3tools/client-runtime";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import ChatView from "../components/ChatView";
import {
  shouldDeleteAbandonedPromotedDraftThread,
  threadHasConversationContent,
} from "../components/ChatView.logic";
import { useComposerDraftStore, DraftId, type DraftSessionState } from "../composerDraftStore";
import { SidebarInset } from "../components/ui/sidebar";
import {
  createProjectSelectorByRef,
  createThreadSelectorAcrossEnvironments,
} from "../storeSelectors";
import { selectSidebarThreadSummaryByRef, selectThreadByRef, useStore } from "../store";
import { buildThreadRouteParams } from "../threadRoutes";
import { readEnvironmentApi } from "../environmentApi";
import { newCommandId } from "../lib/utils";
import type { Thread } from "../types";
import { selectLocalDispatchSnapshot, useLocalDispatchStore } from "../localDispatchStore";
import {
  deletePrewarmedDraftThreadId,
  ensurePrewarmedDraftThreadSession,
  prewarmDraftThreadSession,
} from "../draftThreadPrewarm";

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const serverThread = useStore(
    useMemo(
      () => createThreadSelectorAcrossEnvironments(draftSession?.threadId ?? null),
      [draftSession?.threadId],
    ),
  );
  const cleanupStateRef = useRef<{
    draftSession: DraftSessionState | null;
    serverThread: Thread | null | undefined;
  }>({ draftSession: null, serverThread: undefined });
  const draftProjectRef = useMemo(
    () =>
      draftSession ? scopeProjectRef(draftSession.environmentId, draftSession.projectId) : null,
    [draftSession],
  );
  const draftProject = useStore(
    useMemo(() => createProjectSelectorByRef(draftProjectRef), [draftProjectRef]),
  );
  const serverThreadStarted = threadHasConversationContent(serverThread);
  const canonicalThreadRef = useMemo(
    () =>
      draftSession?.promotedTo
        ? serverThreadStarted
          ? draftSession.promotedTo
          : null
        : serverThread
          ? {
              environmentId: serverThread.environmentId,
              threadId: serverThread.id,
            }
          : null,
    [draftSession?.promotedTo, serverThread, serverThreadStarted],
  );

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(canonicalThreadRef),
      replace: true,
    });
  }, [canonicalThreadRef, navigate]);

  useEffect(() => {
    cleanupStateRef.current = { draftSession, serverThread };
  }, [draftSession, serverThread]);

  useEffect(() => {
    return () => {
      const { draftSession: latestDraftSession, serverThread: latestServerThread } =
        cleanupStateRef.current;
      if (!latestDraftSession?.promotedTo || !latestServerThread) {
        return;
      }

      const latestThreadRef = latestDraftSession.promotedTo;
      const latestState = useStore.getState();
      const currentServerThread = selectThreadByRef(latestState, latestThreadRef);
      const currentSidebarThread = selectSidebarThreadSummaryByRef(latestState, latestThreadRef);
      const currentLocalDispatch = selectLocalDispatchSnapshot(
        useLocalDispatchStore.getState().byThreadKey,
        latestThreadRef,
      );
      if (
        !shouldDeleteAbandonedPromotedDraftThread({
          draftThread: latestDraftSession,
          threadRef: latestThreadRef,
          serverThread: currentServerThread ?? latestServerThread,
          sidebarThread: currentSidebarThread,
          hasLocalDispatch: currentLocalDispatch !== null,
        })
      ) {
        return;
      }

      const api = readEnvironmentApi(latestDraftSession.environmentId);
      void api?.orchestration
        .dispatchCommand({
          type: "thread.delete",
          commandId: newCommandId(),
          threadId: latestDraftSession.threadId,
        })
        .catch(() => undefined);
      useComposerDraftStore.getState().clearDraftThread(draftId);
      deletePrewarmedDraftThreadId(latestDraftSession);
    };
  }, [draftId]);

  useEffect(() => {
    if (!draftSession || serverThread || draftSession.envMode !== "local" || !draftProject) {
      return;
    }
    // Keep the prewarmed server thread out of the sidebar until the user sends
    // the first message, matching useHandleNewThread. Without this, navigating
    // straight to a draft route (or any path that didn't pre-register the
    // thread in prewarmedDraftThreadIds) creates the thread unhidden, so it
    // briefly surfaces in the sidebar during the connecting phase.
    prewarmDraftThreadSession(draftSession, draftProject, { hideCreatedThread: true });
  }, [draftProject, draftSession, serverThread]);

  useEffect(() => {
    if (
      !draftSession ||
      !serverThread ||
      draftSession.envMode !== "local" ||
      threadHasConversationContent(serverThread)
    ) {
      return;
    }
    void ensurePrewarmedDraftThreadSession(draftSession);
  }, [draftSession, serverThread]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  if (canonicalThreadRef) {
    return (
      <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
        <ChatView
          environmentId={canonicalThreadRef.environmentId}
          threadId={canonicalThreadRef.threadId}
          routeKind="server"
        />
      </SidebarInset>
    );
  }

  if (!draftSession) {
    return null;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ChatView
        draftId={draftId}
        environmentId={draftSession.environmentId}
        threadId={draftSession.threadId}
        routeKind="draft"
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftChatThreadRouteView,
});
