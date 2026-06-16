import { scopedThreadKey } from "@t3tools/client-runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import type { LocalDispatchSnapshot } from "./components/ChatView.logic";

export interface LocalDispatchStoreState {
  byThreadKey: Record<string, LocalDispatchSnapshot>;
  begin: (ref: ScopedThreadRef, snapshot: LocalDispatchSnapshot) => void;
  clear: (ref: ScopedThreadRef) => void;
}

const removeThreadKey = (
  byThreadKey: Record<string, LocalDispatchSnapshot>,
  threadKey: string,
): Record<string, LocalDispatchSnapshot> => {
  if (!(threadKey in byThreadKey)) return byThreadKey;
  const { [threadKey]: _removed, ...rest } = byThreadKey;
  return rest;
};

export const useLocalDispatchStore = create<LocalDispatchStoreState>()((set) => ({
  byThreadKey: {},
  begin: (ref, snapshot) =>
    set((state) => {
      const threadKey = scopedThreadKey(ref);
      const current = state.byThreadKey[threadKey];
      const next =
        current === undefined
          ? snapshot
          : current.preparingWorktree === snapshot.preparingWorktree
            ? current
            : { ...current, preparingWorktree: snapshot.preparingWorktree };
      if (next === current) return state;
      return {
        byThreadKey: {
          ...state.byThreadKey,
          [threadKey]: next,
        },
      };
    }),
  clear: (ref) =>
    set((state) => {
      const nextByThreadKey = removeThreadKey(state.byThreadKey, scopedThreadKey(ref));
      return nextByThreadKey === state.byThreadKey ? state : { byThreadKey: nextByThreadKey };
    }),
}));

export function selectLocalDispatchSnapshot(
  byThreadKey: Record<string, LocalDispatchSnapshot>,
  ref: ScopedThreadRef | null,
): LocalDispatchSnapshot | null {
  if (!ref) return null;
  return byThreadKey[scopedThreadKey(ref)] ?? null;
}
