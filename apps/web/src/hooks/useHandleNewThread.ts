import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime";
import {
  DEFAULT_RUNTIME_MODE,
  type ScopedProjectRef,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DraftId,
  type DraftThreadEnvMode,
  type DraftThreadState,
  useComposerDraftStore,
} from "../composerDraftStore";
import { threadHasConversationContent } from "../components/ChatView.logic";
import { newDraftId, newThreadId } from "../lib/utils";
import { orderItemsByPreferredIds } from "../components/Sidebar.logic";
import {
  deriveLogicalProjectKeyFromSettings,
  getProjectOrderKey,
  selectProjectGroupingSettings,
} from "../logicalProject";
import {
  selectProjectsAcrossEnvironments,
  selectSidebarThreadSummaryByRef,
  selectThreadByRef,
  useStore,
} from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { buildThreadRouteParams, resolveThreadRouteTarget } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";
import {
  activatePrewarmedDraftThreadSession,
  ensurePrewarmedDraftThreadSession,
  prewarmDraftThreadSession,
} from "../draftThreadPrewarm";
import { useSettings } from "./useSettings";

function useNewThreadState() {
  const projects = useStore(useShallow((store) => selectProjectsAcrossEnvironments(store)));
  const projectGroupingSettings = useSettings(selectProjectGroupingSettings);
  const router = useRouter();
  const getCurrentRouteTarget = useCallback(() => {
    const currentRouteParams = router.state.matches[router.state.matches.length - 1]?.params ?? {};
    return resolveThreadRouteTarget(currentRouteParams);
  }, [router]);

  return useCallback(
    (
      projectRef: ScopedProjectRef,
      options?: {
        branch?: string | null;
        worktreePath?: string | null;
        envMode?: DraftThreadEnvMode;
        prewarmOnly?: boolean;
      },
    ): Promise<void> => {
      const draftStoreState = useComposerDraftStore.getState();
      const {
        getDraftSessionByLogicalProjectKey,
        getDraftSession,
        getDraftThread,
        applyStickyState,
        setDraftThreadContext,
        setLogicalProjectDraftThreadId,
      } = draftStoreState;
      const currentRouteTarget = getCurrentRouteTarget();
      const project = projects.find(
        (candidate) =>
          candidate.id === projectRef.projectId &&
          candidate.environmentId === projectRef.environmentId,
      );
      const logicalProjectKey = project
        ? deriveLogicalProjectKeyFromSettings(project, projectGroupingSettings)
        : scopedProjectKey(projectRef);
      const serverThreadRefHasConversationContent = (threadRef: ScopedThreadRef): boolean => {
        const serverThread = selectThreadByRef(useStore.getState(), threadRef);
        if (threadHasConversationContent(serverThread)) {
          return true;
        }
        const sidebarThread = selectSidebarThreadSummaryByRef(useStore.getState(), threadRef);
        return (
          (sidebarThread?.latestUserMessageAt !== null &&
            sidebarThread?.latestUserMessageAt !== undefined) ||
          (sidebarThread?.latestTurn !== null && sidebarThread?.latestTurn !== undefined)
        );
      };
      const hasBranchOption = options?.branch !== undefined;
      const hasWorktreePathOption = options?.worktreePath !== undefined;
      const hasEnvModeOption = options?.envMode !== undefined;
      let storedDraftThread = getDraftSessionByLogicalProjectKey(logicalProjectKey);
      if (!storedDraftThread) {
        for (const [draftId, draftThread] of Object.entries(
          draftStoreState.draftThreadsByThreadKey,
        )) {
          if (
            draftThread.logicalProjectKey !== logicalProjectKey ||
            draftThread.projectId !== projectRef.projectId ||
            draftThread.environmentId !== projectRef.environmentId ||
            !draftThread.promotedTo
          ) {
            continue;
          }
          const promotedThreadRef = {
            environmentId: draftThread.promotedTo.environmentId,
            threadId: draftThread.promotedTo.threadId,
          };
          if (serverThreadRefHasConversationContent(promotedThreadRef)) {
            continue;
          }
          storedDraftThread = {
            ...draftThread,
            draftId: DraftId.make(draftId),
          };
          break;
        }
      }
      const latestActiveDraftThread: DraftThreadState | null = currentRouteTarget
        ? currentRouteTarget.kind === "server"
          ? getDraftThread(currentRouteTarget.threadRef)
          : getDraftSession(currentRouteTarget.draftId)
        : null;
      const currentServerThread =
        currentRouteTarget?.kind === "server"
          ? selectThreadByRef(useStore.getState(), currentRouteTarget.threadRef)
          : null;
      const currentServerThreadProject = currentServerThread
        ? projects.find(
            (candidate) =>
              candidate.id === currentServerThread.projectId &&
              candidate.environmentId === currentServerThread.environmentId,
          )
        : null;
      const currentServerThreadLogicalProjectKey = currentServerThreadProject
        ? deriveLogicalProjectKeyFromSettings(currentServerThreadProject, projectGroupingSettings)
        : currentServerThread
          ? scopedProjectKey(
              scopeProjectRef(currentServerThread.environmentId, currentServerThread.projectId),
            )
          : null;

      if (
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread?.logicalProjectKey === logicalProjectKey
      ) {
        return Promise.resolve();
      }

      if (
        currentRouteTarget?.kind === "server" &&
        currentServerThreadLogicalProjectKey === logicalProjectKey &&
        !threadHasConversationContent(currentServerThread)
      ) {
        return Promise.resolve();
      }

      if (
        currentRouteTarget?.kind === "server" &&
        latestActiveDraftThread?.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo?.environmentId ===
          currentRouteTarget.threadRef.environmentId &&
        latestActiveDraftThread.promotedTo.threadId === currentRouteTarget.threadRef.threadId &&
        !threadHasConversationContent(currentServerThread)
      ) {
        return Promise.resolve();
      }
      if (storedDraftThread) {
        return (async () => {
          if (options?.prewarmOnly) {
            if (storedDraftThread.promotedTo) {
              void ensurePrewarmedDraftThreadSession(storedDraftThread);
            } else if (project) {
              prewarmDraftThreadSession(storedDraftThread, project, {
                hideCreatedThread: true,
              });
            }
            return;
          }
          if (hasBranchOption || hasWorktreePathOption || hasEnvModeOption) {
            setDraftThreadContext(storedDraftThread.draftId, {
              ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
              ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
              ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
            });
          }
          setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, storedDraftThread.draftId, {
            threadId: storedDraftThread.threadId,
          });
          if (
            currentRouteTarget?.kind === "draft" &&
            currentRouteTarget.draftId === storedDraftThread.draftId
          ) {
            return;
          }
          await activatePrewarmedDraftThreadSession(storedDraftThread, {
            waitForPending: true,
          });
          const latestStoredDraftThread =
            useComposerDraftStore.getState().getDraftSession(storedDraftThread.draftId) ??
            storedDraftThread;
          const promotedServerThread = latestStoredDraftThread.promotedTo
            ? selectThreadByRef(useStore.getState(), latestStoredDraftThread.promotedTo)
            : null;
          if (latestStoredDraftThread.promotedTo && promotedServerThread) {
            await router.navigate({
              to: "/$environmentId/$threadId",
              params: buildThreadRouteParams(latestStoredDraftThread.promotedTo),
            });
            return;
          }
          await router.navigate({
            to: "/draft/$draftId",
            params: { draftId: storedDraftThread.draftId },
          });
        })();
      }

      if (
        latestActiveDraftThread &&
        currentRouteTarget?.kind === "draft" &&
        latestActiveDraftThread.logicalProjectKey === logicalProjectKey &&
        latestActiveDraftThread.promotedTo == null
      ) {
        if (hasBranchOption || hasWorktreePathOption || hasEnvModeOption) {
          setDraftThreadContext(currentRouteTarget.draftId, {
            ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
            ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
            ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
          });
        }
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, currentRouteTarget.draftId, {
          threadId: latestActiveDraftThread.threadId,
          createdAt: latestActiveDraftThread.createdAt,
          runtimeMode: latestActiveDraftThread.runtimeMode,
          interactionMode: latestActiveDraftThread.interactionMode,
          ...(hasBranchOption ? { branch: options?.branch ?? null } : {}),
          ...(hasWorktreePathOption ? { worktreePath: options?.worktreePath ?? null } : {}),
          ...(hasEnvModeOption ? { envMode: options?.envMode } : {}),
        });
        return Promise.resolve();
      }

      const draftId = newDraftId();
      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      return (async () => {
        setLogicalProjectDraftThreadId(logicalProjectKey, projectRef, draftId, {
          threadId,
          createdAt,
          branch: options?.branch ?? null,
          worktreePath: options?.worktreePath ?? null,
          envMode: options?.envMode ?? "local",
          runtimeMode: DEFAULT_RUNTIME_MODE,
        });
        applyStickyState(draftId);
        const draftSession = useComposerDraftStore.getState().getDraftSession(draftId);
        if (draftSession && project) {
          // Keep prewarmed draft-backed server threads out of the sidebar until
          // the user actually sends the first message in that draft.
          prewarmDraftThreadSession(draftSession, project, {
            hideCreatedThread: true,
          });
        }
        if (options?.prewarmOnly) {
          return;
        }

        await router.navigate({
          to: "/draft/$draftId",
          params: { draftId },
        });
      })();
    },
    [getCurrentRouteTarget, projectGroupingSettings, router, projects],
  );
}

export function useNewThreadHandler() {
  const handleNewThread = useNewThreadState();

  return {
    handleNewThread,
  };
}

export function useHandleNewThread() {
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThread = useStore(
    useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
  );
  const getDraftThread = useComposerDraftStore((store) => store.getDraftThread);
  const activeDraftThread = useComposerDraftStore(() =>
    routeTarget
      ? routeTarget.kind === "server"
        ? getDraftThread(routeTarget.threadRef)
        : useComposerDraftStore.getState().getDraftSession(routeTarget.draftId)
      : null,
  );
  const projects = useStore(useShallow((store) => selectProjectsAcrossEnvironments(store)));
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
    });
  }, [projectOrder, projects]);
  const handleNewThread = useNewThreadState();

  return {
    activeDraftThread,
    activeThread,
    defaultProjectRef: orderedProjects[0]
      ? scopeProjectRef(orderedProjects[0].environmentId, orderedProjects[0].id)
      : null,
    handleNewThread,
    routeThreadRef,
  };
}
