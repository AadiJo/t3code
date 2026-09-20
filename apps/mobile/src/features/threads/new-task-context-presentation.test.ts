import { resolveNewTaskWorkspaceSelection } from "./new-task-context-presentation";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveNewTaskBranchWorktreePath,
  resolveNewTaskBranchLabel,
  resolveNewTaskLocalWorkspaceSelection,
} from "./new-task-context-presentation";

describe("resolveNewTaskLocalWorkspaceSelection", () => {
  it("waits for refs instead of carrying a worktree base into Current checkout", () => {
    expect(
      resolveNewTaskLocalWorkspaceSelection({
        branches: [],
        projectCwd: "/repo",
      }),
    ).toEqual({
      branch: null,
      worktreePath: null,
      awaitsCurrentBranch: true,
    });
  });

  it("adopts the checkout's current branch once refs load", () => {
    expect(
      resolveNewTaskLocalWorkspaceSelection({
        branches: [
          { name: "feature/worktree-base", current: false, worktreePath: "/worktree" },
          { name: "main", current: true, worktreePath: "/repo" },
        ],
        projectCwd: "/repo",
      }),
    ).toEqual({
      branch: "main",
      worktreePath: null,
      awaitsCurrentBranch: false,
    });
  });

  it("carries the worktree path when the current branch lives in another worktree", () => {
    expect(
      resolveNewTaskLocalWorkspaceSelection({
        branches: [
          { name: "feature/split", current: true, worktreePath: "/repo/.t3/worktrees/split" },
          { name: "main", current: false, worktreePath: "/repo" },
        ],
        projectCwd: "/repo",
      }),
    ).toEqual({
      branch: "feature/split",
      worktreePath: "/repo/.t3/worktrees/split",
      awaitsCurrentBranch: false,
    });
  });
});

describe("resolveNewTaskBranchWorktreePath", () => {
  it("moves Current checkout to the selected existing worktree", () => {
    expect(
      resolveNewTaskBranchWorktreePath({
        workspaceMode: "local",
        projectCwd: "/repo",
        branchWorktreePath: "/repo/.t3/worktrees/feature",
      }),
    ).toBe("/repo/.t3/worktrees/feature");
  });

  it("keeps the project checkout represented by a null override", () => {
    expect(
      resolveNewTaskBranchWorktreePath({
        workspaceMode: "local",
        projectCwd: "/repo",
        branchWorktreePath: "/repo",
      }),
    ).toBeNull();
  });

  it("does not reuse an existing worktree while creating a new one", () => {
    expect(
      resolveNewTaskBranchWorktreePath({
        workspaceMode: "worktree",
        projectCwd: "/repo",
        branchWorktreePath: "/repo/.t3/worktrees/feature",
      }),
    ).toBeNull();
  });
});

describe("resolveNewTaskBranchLabel", () => {
  it("shows the checked-out branch without a base-ref prefix", () => {
    expect(
      resolveNewTaskBranchLabel({
        branchName: "feature/mobile",
        startFromOrigin: true,
        workspaceMode: "local",
      }),
    ).toBe("feature/mobile");
  });

  it("labels a local worktree base with From", () => {
    expect(
      resolveNewTaskBranchLabel({
        branchName: "main",
        startFromOrigin: false,
        workspaceMode: "worktree",
      }),
    ).toBe("From main");
  });

  it("labels a remote worktree base with From origin", () => {
    expect(
      resolveNewTaskBranchLabel({
        branchName: "main",
        startFromOrigin: true,
        workspaceMode: "worktree",
      }),
    ).toBe("From origin/main");
  });

  it("prompts when no branch is available", () => {
    expect(
      resolveNewTaskBranchLabel({
        branchName: null,
        startFromOrigin: true,
        workspaceMode: "worktree",
      }),
    ).toBe("Choose branch");
  });
});

describe("resolveNewTaskWorkspaceSelection", () => {
  const worktree = { mode: "worktree" as const, branch: "main", worktreePath: "/old-worktree" };

  it("starts in the project directory when a non-repository has a saved worktree choice", () => {
    expect(resolveNewTaskWorkspaceSelection({ ...worktree, isRepository: false })).toEqual({
      mode: "local",
      branch: null,
      worktreePath: null,
    });
  });

  it("clears a saved checkout branch and path for non-repositories", () => {
    expect(
      resolveNewTaskWorkspaceSelection({ ...worktree, mode: "local", isRepository: false }),
    ).toEqual({
      mode: "local",
      branch: null,
      worktreePath: null,
    });
  });

  it.each([true, null])("preserves selections when repository status is %s", (isRepository) => {
    expect(resolveNewTaskWorkspaceSelection({ ...worktree, isRepository })).toEqual(worktree);
  });
});
