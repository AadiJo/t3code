import type { EnvironmentId } from "@t3tools/contracts";

import { parseWslUncPath } from "./wslPaths";

export interface ProjectPathTarget {
  readonly environmentId: EnvironmentId;
  readonly rawCwd: string;
  readonly platform: string;
  readonly currentProjectCwd: string | null;
}

export interface DesktopLocalProjectTargetRecord {
  readonly environmentId: EnvironmentId;
  readonly instanceId: string | null | undefined;
}

export function resolveProjectPathTarget(input: {
  readonly rawCwd: string;
  readonly fallbackTarget: ProjectPathTarget | null;
  readonly desktopLocalTargets: ReadonlyArray<DesktopLocalProjectTargetRecord>;
}):
  | { readonly ok: true; readonly target: ProjectPathTarget }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const parsedWslPath = parseWslUncPath(input.rawCwd);
  if (parsedWslPath) {
    const wslTargets = input.desktopLocalTargets.filter((target) =>
      target.instanceId?.startsWith("wsl:"),
    );
    const exactMatch = wslTargets.find(
      (target) => target.instanceId?.toLowerCase() === `wsl:${parsedWslPath.distro}`.toLowerCase(),
    );
    const resolvedTarget = exactMatch ?? (wslTargets.length === 1 ? wslTargets[0] : null);
    if (!resolvedTarget) {
      return {
        ok: false,
        error: "Start the WSL backend, then choose that folder again.",
      };
    }
    return {
      ok: true,
      target: {
        environmentId: resolvedTarget.environmentId,
        rawCwd: parsedWslPath.linuxPath,
        platform: "Linux",
        currentProjectCwd: null,
      },
    };
  }

  if (!input.fallbackTarget) {
    return {
      ok: false,
      error: "No environment is available.",
    };
  }

  return {
    ok: true,
    target: input.fallbackTarget,
  };
}
