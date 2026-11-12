import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { usesGeminiModelIcon, usesGrokModelIcon, usesMetaModelIcon } from "./providerIconUtils";

describe("usesMetaModelIcon", () => {
  const openCode = ProviderDriverKind.make("opencode");

  it("uses the Meta icon for OpenCode Muse Spark models", () => {
    expect(usesMetaModelIcon(openCode, "opencode/muse-spark-1.0")).toBe(true);
  });

  it("keeps the OpenCode icon for other OpenCode models", () => {
    expect(usesMetaModelIcon(openCode, "opencode/gpt-5.4")).toBe(false);
  });
});

describe("usesGrokModelIcon", () => {
  const cursor = ProviderDriverKind.make("cursor");

  it("uses the Grok icon for Cursor Grok models", () => {
    expect(usesGrokModelIcon(cursor, "grok-4.1")).toBe(true);
  });

  it("keeps the Cursor icon for other Cursor models", () => {
    expect(usesGrokModelIcon(cursor, "claude-4.5-sonnet")).toBe(false);
  });

  it("does not override the Grok provider icon", () => {
    expect(usesGrokModelIcon(ProviderDriverKind.make("grok"), "grok-4.1")).toBe(false);
  });
});

describe("usesGeminiModelIcon", () => {
  const cursor = ProviderDriverKind.make("cursor");

  it("uses the Gemini icon for Cursor Gemini models", () => {
    expect(usesGeminiModelIcon(cursor, "gemini-3.1-pro")).toBe(true);
  });

  it("keeps the Cursor icon for other Cursor models", () => {
    expect(usesGeminiModelIcon(cursor, "claude-4.5-sonnet")).toBe(false);
  });

  it("does not override another provider icon", () => {
    expect(usesGeminiModelIcon(ProviderDriverKind.make("antigravity"), "gemini-3.1-pro")).toBe(
      false,
    );
  });
});
