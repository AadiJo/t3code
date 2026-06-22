import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  migratePersistedMarkdownViewPreferenceStoreState,
  selectThreadMarkdownViewMode,
  useMarkdownViewPreferenceStore,
} from "./markdownViewPreferenceStore";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-B"));

beforeEach(() => {
  useMarkdownViewPreferenceStore.setState({ byThreadKey: {} });
});

describe("markdownViewPreferenceStore", () => {
  it("tracks markdown mode independently per thread", () => {
    const store = useMarkdownViewPreferenceStore.getState();
    store.setMarkdownViewMode(refA, "preview");
    store.setMarkdownViewMode(refB, "raw");

    expect(
      selectThreadMarkdownViewMode(useMarkdownViewPreferenceStore.getState().byThreadKey, refA),
    ).toBe("preview");
    expect(
      selectThreadMarkdownViewMode(useMarkdownViewPreferenceStore.getState().byThreadKey, refB),
    ).toBe("raw");
  });

  it("drops default raw entries instead of persisting redundant state", () => {
    const store = useMarkdownViewPreferenceStore.getState();
    store.setMarkdownViewMode(refA, "preview");
    expect(useMarkdownViewPreferenceStore.getState().byThreadKey).toEqual({
      [scopedThreadKey(refA)]: { markdownViewMode: "preview" },
    });

    store.setMarkdownViewMode(refA, "raw");
    expect(useMarkdownViewPreferenceStore.getState().byThreadKey).toEqual({});
  });

  it("removeThread clears a deleted thread preference", () => {
    const store = useMarkdownViewPreferenceStore.getState();
    store.setMarkdownViewMode(refA, "preview");
    store.removeThread(refA);

    expect(
      selectThreadMarkdownViewMode(useMarkdownViewPreferenceStore.getState().byThreadKey, refA),
    ).toBe("raw");
  });

  it("filters invalid persisted thread keys and modes during migration", () => {
    expect(
      migratePersistedMarkdownViewPreferenceStoreState({
        byThreadKey: {
          [scopedThreadKey(refA)]: { markdownViewMode: "preview" },
          "bad-key": { markdownViewMode: "preview" },
          [scopedThreadKey(refB)]: { markdownViewMode: "unknown" },
        },
      }),
    ).toEqual({
      byThreadKey: {
        [scopedThreadKey(refA)]: { markdownViewMode: "preview" },
      },
    });
  });
});
