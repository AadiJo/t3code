import { describe, expect, it } from "@effect/vitest";
import { deriveEmptyState } from "./homeEmptyState";
import type { WorkspaceState } from "../../state/workspaceModel";

const initialState: WorkspaceState = {
  isLoadingConnections: false,
  hasConnections: true,
  hasLoadedShellSnapshot: false,
  hasPendingShellSnapshot: false,
  hasReadyEnvironment: false,
  hasConnectingEnvironment: false,
  connectingEnvironments: [],
  connectionState: "available",
  connectionError: null,
  shellSnapshotError: null,
  latestCachedSnapshotReceivedAt: null,
  networkStatus: "online",
};

function emptyState(changes: Partial<WorkspaceState> = {}) {
  return deriveEmptyState({ catalogState: { ...initialState, ...changes }, projectCount: 0 });
}

describe("home startup empty state", () => {
  it("keeps loading while saved environments start connecting and fetch their first snapshot", () => {
    for (const connectionState of ["available", "connecting", "connected"] as const) {
      expect(emptyState({ connectionState }).loading).toBe(true);
    }
  });

  it("shows real connection failures", () => {
    for (const connectionState of ["offline", "error", "unsupported"] as const) {
      expect(emptyState({ connectionState }).loading).toBe(false);
    }
  });

  it("shows onboarding when there are no connections", () => {
    expect(emptyState({ hasConnections: false }).title).toBe("No environments connected");
  });

  it("shows the empty project state once the snapshot arrives", () => {
    expect(emptyState({ connectionState: "connected", hasLoadedShellSnapshot: true }).title).toBe(
      "No projects found",
    );
  });
});
