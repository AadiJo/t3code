import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_THREAD_MARKDOWN_VIEW_PREFERENCE_STATE,
  type MarkdownViewMode,
  type ThreadMarkdownViewPreferenceState,
} from "./components/files/filePreviewMode";
import { resolveStorage } from "./lib/storage";

const MARKDOWN_VIEW_PREFERENCE_STORAGE_KEY = "t3code:thread-markdown-view:v1";

interface PersistedMarkdownViewPreferenceStoreState {
  byThreadKey?: Record<string, ThreadMarkdownViewPreferenceState>;
}

export interface MarkdownViewPreferenceStoreState {
  byThreadKey: Record<string, ThreadMarkdownViewPreferenceState>;
  setMarkdownViewMode: (threadRef: ScopedThreadRef, mode: MarkdownViewMode) => void;
  removeThread: (threadRef: ScopedThreadRef) => void;
}

function createMarkdownViewPreferenceStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

function isDefaultThreadMarkdownViewPreferenceState(
  state: ThreadMarkdownViewPreferenceState,
): boolean {
  return state.markdownViewMode === DEFAULT_THREAD_MARKDOWN_VIEW_PREFERENCE_STATE.markdownViewMode;
}

export function migratePersistedMarkdownViewPreferenceStoreState(
  persistedState: unknown,
): PersistedMarkdownViewPreferenceStoreState {
  if (!persistedState || typeof persistedState !== "object") {
    return { byThreadKey: {} };
  }

  const candidate = persistedState as PersistedMarkdownViewPreferenceStoreState;
  const byThreadKey = Object.fromEntries(
    Object.entries(candidate.byThreadKey ?? {}).flatMap(([threadKey, threadState]) => {
      if (!parseScopedThreadKey(threadKey)) return [];
      if (!threadState || typeof threadState !== "object") return [];
      return threadState.markdownViewMode === "preview" || threadState.markdownViewMode === "raw"
        ? [[threadKey, { markdownViewMode: threadState.markdownViewMode }]]
        : [];
    }),
  );

  return { byThreadKey };
}

export const useMarkdownViewPreferenceStore = create<MarkdownViewPreferenceStoreState>()(
  persist(
    (set) => ({
      byThreadKey: {},
      setMarkdownViewMode: (threadRef, mode) =>
        set((state) => {
          const threadKey = scopedThreadKey(threadRef);
          if (mode === DEFAULT_THREAD_MARKDOWN_VIEW_PREFERENCE_STATE.markdownViewMode) {
            if (!(threadKey in state.byThreadKey)) return state;
            const nextByThreadKey = { ...state.byThreadKey };
            delete nextByThreadKey[threadKey];
            return { byThreadKey: nextByThreadKey };
          }

          const current = state.byThreadKey[threadKey];
          if (current?.markdownViewMode === mode) return state;
          return {
            byThreadKey: {
              ...state.byThreadKey,
              [threadKey]: { markdownViewMode: mode },
            },
          };
        }),
      removeThread: (threadRef) =>
        set((state) => {
          const threadKey = scopedThreadKey(threadRef);
          if (!(threadKey in state.byThreadKey)) return state;
          const nextByThreadKey = { ...state.byThreadKey };
          delete nextByThreadKey[threadKey];
          return { byThreadKey: nextByThreadKey };
        }),
    }),
    {
      name: MARKDOWN_VIEW_PREFERENCE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(createMarkdownViewPreferenceStorage),
      migrate: migratePersistedMarkdownViewPreferenceStoreState,
      partialize: (state) => ({
        byThreadKey: Object.fromEntries(
          Object.entries(state.byThreadKey).filter(
            ([, threadState]) => !isDefaultThreadMarkdownViewPreferenceState(threadState),
          ),
        ),
      }),
    },
  ),
);

export function selectThreadMarkdownViewPreference(
  byThreadKey: Record<string, ThreadMarkdownViewPreferenceState>,
  threadRef: ScopedThreadRef,
): ThreadMarkdownViewPreferenceState {
  return byThreadKey[scopedThreadKey(threadRef)] ?? DEFAULT_THREAD_MARKDOWN_VIEW_PREFERENCE_STATE;
}

export function selectThreadMarkdownViewMode(
  byThreadKey: Record<string, ThreadMarkdownViewPreferenceState>,
  threadRef: ScopedThreadRef,
): MarkdownViewMode {
  return selectThreadMarkdownViewPreference(byThreadKey, threadRef).markdownViewMode;
}
