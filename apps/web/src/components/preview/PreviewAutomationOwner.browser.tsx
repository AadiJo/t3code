import { scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "vitest-browser-react";

const readEnvironmentApiMock = vi.hoisted(() => vi.fn());

vi.mock("~/environmentApi", () => ({
  readEnvironmentApi: readEnvironmentApiMock,
}));

import { PreviewAutomationOwner } from "./PreviewAutomationOwner";

describe("PreviewAutomationOwner", () => {
  it("does not crash while a secondary environment api is unavailable", async () => {
    readEnvironmentApiMock.mockReturnValue(undefined);

    const threadRef = scopeThreadRef(
      EnvironmentId.make("environment-wsl"),
      "thread-wsl" as ThreadId,
    );

    const screen = await render(<PreviewAutomationOwner threadRef={threadRef} visible={false} />);

    expect(screen.container).toBeTruthy();
    expect(readEnvironmentApiMock).toHaveBeenCalledWith(threadRef.environmentId);
  });
});
