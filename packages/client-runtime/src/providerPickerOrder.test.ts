import { describe, expect, it } from "vite-plus/test";

import { orderClaudeBeforeOpenAi } from "./providerPickerOrder.ts";

const order = (drivers: ReadonlyArray<string>) =>
  orderClaudeBeforeOpenAi(drivers, (driver) => driver);

describe("orderClaudeBeforeOpenAi", () => {
  it("moves every Claude provider ahead of the first OpenAI provider", () => {
    expect(order(["cursor", "codex", "codex-work", "grok", "claudeAgent", "claudeAgent"])).toEqual([
      "cursor",
      "claudeAgent",
      "claudeAgent",
      "codex",
      "codex-work",
      "grok",
    ]);
    expect(order(["codex", "opencode", "claudeAgent", "codex"])).toEqual([
      "claudeAgent",
      "codex",
      "opencode",
      "codex",
    ]);
  });

  it("keeps the order when Claude already leads or either provider is missing", () => {
    for (const drivers of [
      ["claudeAgent", "codex", "cursor"],
      ["codex", "cursor"],
      ["cursor", "claudeAgent"],
    ]) {
      expect(order(drivers)).toEqual(drivers);
    }
  });
});
