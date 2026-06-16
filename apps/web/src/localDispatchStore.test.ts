import { scopeThreadRef } from "@t3tools/client-runtime";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectLocalDispatchSnapshot, useLocalDispatchStore } from "./localDispatchStore";
import type { LocalDispatchSnapshot } from "./components/ChatView.logic";

const environmentId = "env-1" as EnvironmentId;
const refA = scopeThreadRef(environmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef(environmentId, ThreadId.make("thread-B"));

function snapshot(overrides: Partial<LocalDispatchSnapshot> = {}): LocalDispatchSnapshot {
  return {
    startedAt: "2026-01-01T00:00:00.000Z",
    preparingWorktree: false,
    latestTurnTurnId: null,
    latestTurnRequestedAt: null,
    latestTurnStartedAt: null,
    latestTurnCompletedAt: null,
    sessionOrchestrationStatus: null,
    sessionUpdatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useLocalDispatchStore.setState({ byThreadKey: {} });
});

describe("localDispatchStore", () => {
  it("preserves the original start timestamp when begin is called again", () => {
    useLocalDispatchStore.getState().begin(refA, snapshot());
    useLocalDispatchStore.getState().begin(
      refA,
      snapshot({
        startedAt: "2026-01-01T00:00:05.000Z",
        preparingWorktree: true,
      }),
    );

    expect(
      selectLocalDispatchSnapshot(useLocalDispatchStore.getState().byThreadKey, refA),
    ).toMatchObject({
      startedAt: "2026-01-01T00:00:00.000Z",
      preparingWorktree: true,
    });
  });

  it("clears only the selected thread", () => {
    useLocalDispatchStore.getState().begin(refA, snapshot({ startedAt: "a" }));
    useLocalDispatchStore.getState().begin(refB, snapshot({ startedAt: "b" }));

    useLocalDispatchStore.getState().clear(refA);

    expect(selectLocalDispatchSnapshot(useLocalDispatchStore.getState().byThreadKey, refA)).toBe(
      null,
    );
    expect(
      selectLocalDispatchSnapshot(useLocalDispatchStore.getState().byThreadKey, refB),
    ).toMatchObject({
      startedAt: "b",
    });
  });
});
