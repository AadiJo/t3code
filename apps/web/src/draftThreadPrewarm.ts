import { scopeThreadRef } from "@t3tools/client-runtime";
import {
  DEFAULT_CODEX_MODEL_OPTIONS,
  DEFAULT_MODEL,
  ProviderInstanceId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { markPromotedDraftThreadByRef, type DraftSessionState } from "./composerDraftStore";
import { readEnvironmentApi } from "./environmentApi";
import { newCommandId } from "./lib/utils";
import type { Project } from "./types";

const prewarmedDraftThreadIds = new Set<string>();
const hiddenPrewarmedDraftThreadIds = new Set<string>();
const prewarmTasks = new Map<string, Promise<void>>();

function draftThreadKey(draftSession: DraftSessionState): string {
  return `${draftSession.environmentId}:${draftSession.threadId}`;
}

export function deletePrewarmedDraftThreadId(draftSession: DraftSessionState): void {
  const threadKey = draftThreadKey(draftSession);
  prewarmedDraftThreadIds.delete(threadKey);
  hiddenPrewarmedDraftThreadIds.delete(threadKey);
  prewarmTasks.delete(threadKey);
}

export function isHiddenPrewarmedThreadRef(threadRef: ScopedThreadRef): boolean {
  return hiddenPrewarmedDraftThreadIds.has(`${threadRef.environmentId}:${threadRef.threadId}`);
}

export function prewarmDraftThreadSession(
  draftSession: DraftSessionState,
  draftProject: Project,
  options?: {
    hideCreatedThread?: boolean;
  },
): void {
  if (draftSession.envMode !== "local") {
    return;
  }

  const threadKey = draftThreadKey(draftSession);
  if (draftSession.promotedTo) {
    if (options?.hideCreatedThread === true) {
      hiddenPrewarmedDraftThreadIds.add(threadKey);
    }
    void ensurePrewarmedDraftThreadSession(draftSession);
    return;
  }

  if (prewarmedDraftThreadIds.has(threadKey)) {
    return;
  }
  prewarmedDraftThreadIds.add(threadKey);
  if (options?.hideCreatedThread === true) {
    hiddenPrewarmedDraftThreadIds.add(threadKey);
  }

  const api = readEnvironmentApi(draftSession.environmentId);
  if (!api) {
    prewarmedDraftThreadIds.delete(threadKey);
    hiddenPrewarmedDraftThreadIds.delete(threadKey);
    return;
  }

  const modelSelection =
    draftProject.defaultModelSelection ??
    createModelSelection(
      ProviderInstanceId.make("codex"),
      DEFAULT_MODEL,
      DEFAULT_CODEX_MODEL_OPTIONS,
    );

  const task = (async () => {
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId: draftSession.threadId,
        projectId: draftSession.projectId,
        title: "New thread",
        modelSelection,
        runtimeMode: draftSession.runtimeMode,
        interactionMode: draftSession.interactionMode,
        branch: draftSession.branch,
        worktreePath: draftSession.worktreePath,
        createdAt: draftSession.createdAt,
      });
      markPromotedDraftThreadByRef(
        scopeThreadRef(draftSession.environmentId, draftSession.threadId),
      );
      await api.orchestration.dispatchCommand({
        type: "thread.session.start",
        commandId: newCommandId(),
        threadId: draftSession.threadId,
        createdAt: new Date().toISOString(),
      });
    } catch {
      prewarmedDraftThreadIds.delete(threadKey);
      hiddenPrewarmedDraftThreadIds.delete(threadKey);
      prewarmTasks.delete(threadKey);
    }
  })();
  prewarmTasks.set(threadKey, task);
  void task.finally(() => {
    prewarmTasks.delete(threadKey);
  });
}

export async function ensurePrewarmedDraftThreadSession(
  draftSession: DraftSessionState,
): Promise<void> {
  if (draftSession.envMode !== "local" || !draftSession.promotedTo) {
    return;
  }

  const threadKey = draftThreadKey(draftSession);
  const pending = prewarmTasks.get(threadKey);
  if (pending) {
    await pending.catch(() => undefined);
    return;
  }
  if (prewarmedDraftThreadIds.has(threadKey)) {
    return;
  }

  const api = readEnvironmentApi(draftSession.environmentId);
  if (!api) {
    return;
  }

  prewarmedDraftThreadIds.add(threadKey);
  const task = api.orchestration
    .dispatchCommand({
      type: "thread.session.start",
      commandId: newCommandId(),
      threadId: draftSession.threadId,
      createdAt: new Date().toISOString(),
    })
    .then(() => undefined)
    .catch((error) => {
      prewarmedDraftThreadIds.delete(threadKey);
      throw error;
    })
    .finally(() => {
      prewarmTasks.delete(threadKey);
    });
  prewarmTasks.set(threadKey, task);
  await task.catch(() => undefined);
}

export async function activatePrewarmedDraftThreadSession(
  draftSession: DraftSessionState,
  options?: {
    waitForPending?: boolean;
  },
): Promise<void> {
  const threadKey = draftThreadKey(draftSession);
  const pending = prewarmTasks.get(threadKey);
  if (pending) {
    if (options?.waitForPending === true) {
      await pending.catch(() => undefined);
    } else {
      void pending.catch(() => undefined);
    }
  }

  hiddenPrewarmedDraftThreadIds.delete(threadKey);

  void ensurePrewarmedDraftThreadSession(draftSession);
}
