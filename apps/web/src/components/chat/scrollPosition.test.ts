import { describe, expect, it } from "vite-plus/test";

import { getVerticalScrollEndState } from "./scrollPosition";

describe("getVerticalScrollEndState", () => {
  it("treats unscrollable content as being at the end", () => {
    expect(
      getVerticalScrollEndState({
        clientHeight: 400,
        scrollHeight: 400,
        scrollTop: 0,
      }).isAtEnd,
    ).toBe(true);
  });

  it("treats content within the threshold of the bottom as being at the end", () => {
    expect(
      getVerticalScrollEndState({
        clientHeight: 400,
        scrollHeight: 900,
        scrollTop: 493,
      }).isAtEnd,
    ).toBe(true);
  });

  it("reports when the user can still scroll down", () => {
    expect(
      getVerticalScrollEndState({
        clientHeight: 400,
        scrollHeight: 900,
        scrollTop: 300,
      }).canScrollDown,
    ).toBe(true);
  });
});
