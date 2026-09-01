import { describe, expect, it } from "vite-plus/test";

import {
  detectComposerTrigger,
  serializeComposerFileLink,
  serializeComposerMentionPath,
} from "./composerTrigger.ts";

describe("detectComposerTrigger", () => {
  it("detects a slash skill token in the middle of a message", () => {
    const text = "Use /skill:unslop";

    expect(detectComposerTrigger(text, text.length)).toEqual({
      kind: "slash-command",
      query: "skill:unslop",
      rangeStart: "Use ".length,
      rangeEnd: text.length,
    });
  });

  it.each(["/", "/sk", "/skill:"])("detects partial inline slash skill token %s", (token) => {
    const text = `Use ${token}`;

    expect(detectComposerTrigger(text, text.length)).toEqual({
      kind: "slash-command",
      query: token.slice(1),
      rangeStart: "Use ".length,
      rangeEnd: text.length,
    });
  });

  it.each(["/tmp/build.sh", "/etc/hosts", "/unslop"])(
    "keeps ordinary inline slash token %s as text",
    (token) => {
      const text = `Use ${token}`;

      expect(detectComposerTrigger(text, text.length)).toBeNull();
    },
  );
});

describe("serializeComposerMentionPath", () => {
  it("keeps simple mention paths unquoted", () => {
    expect(serializeComposerMentionPath("src/index.ts")).toBe("src/index.ts");
  });

  it("quotes mention paths containing whitespace", () => {
    expect(serializeComposerMentionPath("docs/My File.md")).toBe('"docs/My File.md"');
  });

  it("escapes quoted mention path content", () => {
    expect(serializeComposerMentionPath('docs/My "File".md')).toBe('"docs/My \\"File\\".md"');
  });
});

describe("serializeComposerFileLink", () => {
  it("uses the basename as the markdown label", () => {
    expect(serializeComposerFileLink("path/to/package.json")).toBe(
      "[package.json](path/to/package.json)",
    );
  });

  it("encodes markdown-sensitive destination characters", () => {
    expect(serializeComposerFileLink("docs/My File (draft).md")).toBe(
      "[My File (draft).md](docs/My%20File%20%28draft%29.md)",
    );
  });

  it("supports windows paths", () => {
    expect(serializeComposerFileLink("C:\\repo\\src\\index.ts")).toBe(
      "[index.ts](C:%5Crepo%5Csrc%5Cindex.ts)",
    );
  });

  it("preserves paths that legitimately start with an at sign", () => {
    expect(serializeComposerFileLink("@scope/package.json")).toBe(
      "[package.json](@scope/package.json)",
    );
  });
});
