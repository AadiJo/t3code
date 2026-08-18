import { describe, expect, it } from "vite-plus/test";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import {
  decodeOriginPullRequestJson,
  decodeOriginPullRequestListJson,
} from "./originPullRequests.ts";

describe("decodeOriginPullRequestJson", () => {
  it("accepts Origin CLI field names and numeric strings", () => {
    const decoded = decodeOriginPullRequestJson(
      JSON.stringify({
        number: "13",
        title: "Add Origin provider",
        url: "https://cursor.com/codebase/acme/checkout/pull/13",
        status: "open",
        head: { ref: "refs/heads/feature/origin" },
        base: { ref: "main" },
        updatedAt: "2026-08-17T00:00:00.000Z",
      }),
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    if (!Result.isSuccess(decoded)) return;
    expect(decoded.success.number).toBe(13);
    expect(decoded.success.headRefName).toBe("feature/origin");
    expect(decoded.success.baseRefName).toBe("main");
    expect(decoded.success.state).toBe("open");
    expect(Option.isSome(decoded.success.updatedAt)).toBe(true);
  });

  it("treats merged closed pull requests as merged", () => {
    const decoded = decodeOriginPullRequestJson(
      JSON.stringify({
        number: 4,
        title: "Landed",
        url: "https://cursor.com/codebase/acme/checkout/pull/4",
        state: "closed",
        merged: true,
        head: "feature/landed",
        base: "main",
      }),
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    if (!Result.isSuccess(decoded)) return;
    expect(decoded.success.state).toBe("merged");
    expect(decoded.success.headRefName).toBe("feature/landed");
  });
});

describe("decodeOriginPullRequestListJson", () => {
  it("skips malformed rows instead of failing the list", () => {
    const decoded = decodeOriginPullRequestListJson(
      JSON.stringify([
        {
          number: 1,
          title: "Ready",
          url: "https://cursor.com/codebase/acme/checkout/pull/1",
          status: "open",
          head: "feature/ready",
          base: "main",
        },
        { title: "Missing number" },
      ]),
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    if (!Result.isSuccess(decoded)) return;
    expect(decoded.success).toHaveLength(1);
    expect(decoded.success[0]?.number).toBe(1);
  });
});
