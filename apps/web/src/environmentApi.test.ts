import { EnvironmentId, type ServerSettingsPatch } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { updateServerSettingsInLocalSecondaryEnvironments } from "./environmentApi";

describe("updateServerSettingsInLocalSecondaryEnvironments", () => {
  it("updates connected desktop-local secondary environments only", async () => {
    const wslEnvironmentId = EnvironmentId.make("environment-wsl");
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const disconnectedWslEnvironmentId = EnvironmentId.make("environment-wsl-disconnected");
    const patch: ServerSettingsPatch = {
      commitMessageInstructions: "Always use lowercase conventional commit prefixes.",
    };
    const wslUpdateSettings = vi.fn(async () => patch);
    const remoteUpdateSettings = vi.fn(async () => patch);

    const dispatches = updateServerSettingsInLocalSecondaryEnvironments(patch, {
      listSavedEnvironmentRecords: () => [
        {
          environmentId: wslEnvironmentId,
          label: "WSL",
          httpBaseUrl: "http://127.0.0.1:3001",
          wsBaseUrl: "ws://127.0.0.1:3001",
          createdAt: "2026-06-21T00:00:00.000Z",
          lastConnectedAt: null,
          desktopLocal: { instanceId: "wsl:ubuntu" },
        },
        {
          environmentId: remoteEnvironmentId,
          label: "Remote",
          httpBaseUrl: "https://remote.example.com",
          wsBaseUrl: "wss://remote.example.com",
          createdAt: "2026-06-21T00:00:00.000Z",
          lastConnectedAt: null,
        },
        {
          environmentId: disconnectedWslEnvironmentId,
          label: "Disconnected WSL",
          httpBaseUrl: "http://127.0.0.1:3002",
          wsBaseUrl: "ws://127.0.0.1:3002",
          createdAt: "2026-06-21T00:00:00.000Z",
          lastConnectedAt: null,
          desktopLocal: { instanceId: "wsl:debian" },
        },
      ],
      readEnvironmentConnection: (environmentId) => {
        if (environmentId === wslEnvironmentId) {
          return {
            client: {
              server: {
                updateSettings: wslUpdateSettings,
              },
            },
          } as never;
        }
        if (environmentId === remoteEnvironmentId) {
          return {
            client: {
              server: {
                updateSettings: remoteUpdateSettings,
              },
            },
          } as never;
        }
        return null;
      },
    });

    await Promise.all(dispatches);

    expect(dispatches).toHaveLength(1);
    expect(wslUpdateSettings).toHaveBeenCalledWith(patch);
    expect(remoteUpdateSettings).not.toHaveBeenCalled();
  });
});
