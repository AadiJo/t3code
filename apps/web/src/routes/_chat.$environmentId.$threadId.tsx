import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import ChatView from "../components/ChatView";
import {
  finalizePromotedDraftThreadByRef,
  useComposerDraftStore,
  type DraftThreadState,
} from "../composerDraftStore";
import { type DiffRouteSearch, parseDiffRouteSearch } from "../diffRouteSearch";
import { readEnvironmentApi } from "../environmentApi";
import { newCommandId } from "../lib/utils";
import {
  selectEnvironmentState,
  selectSidebarThreadSummaryByRef,
  selectThreadExistsByRef,
  useStore,
} from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { resolveThreadRouteRef } from "../threadRoutes";
import { SidebarInset } from "~/components/ui/sidebar";
import { deletePrewarmedDraftThreadId } from "../draftThreadPrewarm";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { Thread } from "../types";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const bootstrapComplete = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).bootstrapComplete,
  );
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const threadExists = useStore((store) => selectThreadExistsByRef(store, threadRef));
  const sidebarThreadExists = useStore(
    (store) => selectSidebarThreadSummaryByRef(store, threadRef) !== undefined,
  );
  const environmentHasServerThreads = useStore(
    (store) => selectEnvironmentState(store, threadRef?.environmentId ?? null).threadIds.length > 0,
  );
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) return false;
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const cleanupStateRef = useRef<{
    threadRef: ScopedThreadRef | null;
    draftThread: DraftThreadState | null;
    serverThread: Thread | null | undefined;
  }>({ threadRef: null, draftThread: null, serverThread: undefined });
  const routeThreadExists = threadExists || sidebarThreadExists || draftThreadExists;
  const serverThreadHasMessages = (serverThread?.messages.length ?? 0) > 0;
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) return;
    if (!routeThreadExists && environmentHasAnyThreads) {
      const timeoutId = window.setTimeout(() => {
        const latestThreadExists = selectThreadExistsByRef(useStore.getState(), threadRef);
        const latestSidebarThreadExists =
          selectSidebarThreadSummaryByRef(useStore.getState(), threadRef) !== undefined;
        const latestDraftThreadExists =
          useComposerDraftStore.getState().getDraftThreadByRef(threadRef) !== null;
        const latestEnvironmentHasThreads =
          selectEnvironmentState(useStore.getState(), threadRef.environmentId).threadIds.length > 0;
        const latestEnvironmentHasDraftThreads = useComposerDraftStore
          .getState()
          .hasDraftThreadsInEnvironment(threadRef.environmentId);
        if (
          !latestThreadExists &&
          !latestSidebarThreadExists &&
          !latestDraftThreadExists &&
          (latestEnvironmentHasThreads || latestEnvironmentHasDraftThreads)
        ) {
          void navigate({ to: "/", replace: true });
        }
      }, 500);
      return () => window.clearTimeout(timeoutId);
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, routeThreadExists, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadHasMessages || !draftThread?.promotedTo) return;
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread?.promotedTo, serverThreadHasMessages, threadRef]);

  useEffect(() => {
    cleanupStateRef.current = { threadRef, draftThread, serverThread };
  }, [draftThread, serverThread, threadRef]);

  useEffect(() => {
    return () => {
      const {
        threadRef: latestThreadRef,
        draftThread: latestDraftThread,
        serverThread: latestServerThread,
      } = cleanupStateRef.current;
      if (
        !latestThreadRef ||
        !latestDraftThread?.promotedTo ||
        !latestServerThread ||
        latestServerThread.messages.length > 0 ||
        latestDraftThread.promotedTo.environmentId !== latestThreadRef.environmentId ||
        latestDraftThread.promotedTo.threadId !== latestThreadRef.threadId
      ) {
        return;
      }

      const api = readEnvironmentApi(latestThreadRef.environmentId);
      void api?.orchestration
        .dispatchCommand({
          type: "thread.delete",
          commandId: newCommandId(),
          threadId: latestThreadRef.threadId,
        })
        .catch(() => undefined);
      useComposerDraftStore.getState().clearDraftThread(latestThreadRef);
      deletePrewarmedDraftThreadId(latestDraftThread);
    };
  }, [threadRef?.environmentId, threadRef?.threadId]);

  if (!threadRef || !bootstrapComplete || !routeThreadExists) return null;

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ChatView
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        routeKind="server"
      />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["diff"])],
  },
  component: ChatThreadRouteView,
});
