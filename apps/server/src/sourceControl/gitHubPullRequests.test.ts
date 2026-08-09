import * as Result from "effect/Result";
import { describe, expect, it } from "vite-plus/test";

import { decodeGitHubCheckRollupJson, summarizeGitHubCheckRollup } from "./gitHubPullRequests.ts";

const checkRun = (fields: { status?: string; conclusion?: string | null }) => ({
  typename: "CheckRun",
  status: fields.status ?? "COMPLETED",
  conclusion: fields.conclusion ?? null,
  state: null,
});

const statusContext = (state: string | null) => ({
  typename: "StatusContext",
  status: null,
  conclusion: null,
  state,
});

describe("summarizeGitHubCheckRollup", () => {
  it("reports success only when every conclusive check passed", () => {
    expect(
      summarizeGitHubCheckRollup([
        checkRun({ conclusion: "SUCCESS" }),
        statusContext("SUCCESS"),
        checkRun({ conclusion: "SUCCESS" }),
      ]),
    ).toEqual({ state: "success", total: 3, passed: 3, failed: 0, pending: 0 });
  });

  it("lets a single failure outrank passing and in-flight checks", () => {
    // The failure is the actionable signal: a red dot must win over amber even
    // while the rest of the suite is still running.
    expect(
      summarizeGitHubCheckRollup([
        checkRun({ conclusion: "SUCCESS" }),
        checkRun({ status: "IN_PROGRESS" }),
        statusContext("FAILURE"),
      ]),
    ).toEqual({ state: "failure", total: 3, passed: 1, failed: 1, pending: 1 });
  });

  it("treats an incomplete CheckRun as pending regardless of conclusion", () => {
    expect(
      summarizeGitHubCheckRollup([
        checkRun({ status: "QUEUED" }),
        checkRun({ conclusion: "SUCCESS" }),
      ]),
    ).toEqual({ state: "pending", total: 2, passed: 1, failed: 0, pending: 1 });
  });

  it("counts skipped and neutral checks toward the total but not the verdict", () => {
    // An all-skipped suite is not an endorsement, so it must not read green
    // off the back of checks that never ran.
    expect(
      summarizeGitHubCheckRollup([
        checkRun({ conclusion: "SKIPPED" }),
        checkRun({ conclusion: "NEUTRAL" }),
        checkRun({ conclusion: "SUCCESS" }),
      ]),
    ).toEqual({ state: "success", total: 3, passed: 1, failed: 0, pending: 0 });
  });

  it("maps every terminal failure conclusion to failed", () => {
    for (const conclusion of ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED"]) {
      expect(summarizeGitHubCheckRollup([checkRun({ conclusion })])?.state).toBe("failure");
    }
  });

  it("does not turn an unrecognized conclusion into a failure", () => {
    // A conclusion GitHub adds later must never light the indicator red on
    // its own; it lands in the neutral bucket instead.
    expect(summarizeGitHubCheckRollup([checkRun({ conclusion: "SOMETHING_NEW" })])).toEqual({
      state: "success",
      total: 1,
      passed: 0,
      failed: 0,
      pending: 0,
    });
  });

  it("returns null when the rollup is empty so no indicator renders", () => {
    expect(summarizeGitHubCheckRollup([])).toBeNull();
  });
});

describe("decodeGitHubCheckRollupJson", () => {
  it("decodes the projected rollup payload", () => {
    const decoded = decodeGitHubCheckRollupJson(
      JSON.stringify([
        { typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS", state: null },
        { typename: "StatusContext", status: null, conclusion: null, state: "FAILURE" },
      ]),
    );

    expect(Result.isSuccess(decoded)).toBe(true);
    expect(Result.isSuccess(decoded) ? decoded.success : null).toEqual({
      state: "failure",
      total: 2,
      passed: 1,
      failed: 1,
      pending: 0,
    });
  });

  it("skips entries it cannot decode rather than failing the batch", () => {
    const decoded = decodeGitHubCheckRollupJson(
      JSON.stringify([42, { typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" }]),
    );

    expect(Result.isSuccess(decoded) ? decoded.success : null).toEqual({
      state: "failure",
      total: 1,
      passed: 0,
      failed: 1,
      pending: 0,
    });
  });

  it("fails when the payload is not an array", () => {
    expect(Result.isSuccess(decodeGitHubCheckRollupJson("{}"))).toBe(false);
  });
});
