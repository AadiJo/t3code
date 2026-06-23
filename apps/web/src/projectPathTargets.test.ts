import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveProjectPathTarget } from "./projectPathTargets";

describe("resolveProjectPathTarget", () => {
  it("maps WSL UNC paths onto the matching WSL environment", () => {
    expect(
      resolveProjectPathTarget({
        rawCwd: "\\\\wsl.localhost\\Ubuntu\\home\\josh\\repo",
        fallbackTarget: {
          environmentId: EnvironmentId.make("environment-windows"),
          rawCwd: "\\\\wsl.localhost\\Ubuntu\\home\\josh\\repo",
          platform: "Win32",
          currentProjectCwd: null,
        },
        desktopLocalTargets: [
          {
            environmentId: EnvironmentId.make("environment-wsl"),
            instanceId: "wsl:Ubuntu",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      target: {
        environmentId: EnvironmentId.make("environment-wsl"),
        rawCwd: "/home/josh/repo",
        platform: "Linux",
        currentProjectCwd: null,
      },
    });
  });

  it("falls back to the only WSL environment when the distro name differs", () => {
    expect(
      resolveProjectPathTarget({
        rawCwd: "\\\\wsl.localhost\\Ubuntu\\home\\josh\\repo",
        fallbackTarget: {
          environmentId: EnvironmentId.make("environment-windows"),
          rawCwd: "\\\\wsl.localhost\\Ubuntu\\home\\josh\\repo",
          platform: "Win32",
          currentProjectCwd: null,
        },
        desktopLocalTargets: [
          {
            environmentId: EnvironmentId.make("environment-wsl"),
            instanceId: "wsl:default",
          },
        ],
      }),
    ).toEqual({
      ok: true,
      target: {
        environmentId: EnvironmentId.make("environment-wsl"),
        rawCwd: "/home/josh/repo",
        platform: "Linux",
        currentProjectCwd: null,
      },
    });
  });

  it("returns the fallback target for non-WSL paths", () => {
    const fallbackTarget = {
      environmentId: EnvironmentId.make("environment-windows"),
      rawCwd: "~/Development/repo",
      platform: "Win32",
      currentProjectCwd: null,
    } as const;

    expect(
      resolveProjectPathTarget({
        rawCwd: fallbackTarget.rawCwd,
        fallbackTarget,
        desktopLocalTargets: [],
      }),
    ).toEqual({
      ok: true,
      target: fallbackTarget,
    });
  });

  it("fails when a WSL UNC path cannot be mapped to any WSL environment", () => {
    expect(
      resolveProjectPathTarget({
        rawCwd: "\\\\wsl.localhost\\Ubuntu\\home\\josh\\repo",
        fallbackTarget: null,
        desktopLocalTargets: [],
      }),
    ).toEqual({
      ok: false,
      error: "Start the WSL backend, then choose that folder again.",
    });
  });
});
