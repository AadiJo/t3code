import { describe, expect, it } from "vite-plus/test";

import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

function renderedWidth(sidebarWidth: number, viewportWidth: number): number {
  const minimumWidth = THREAD_SIDEBAR_MIN_WIDTH;
  return clampThreadSidebarWidth(
    sidebarWidth,
    minimumWidth,
    resolveThreadSidebarMaximumWidth(viewportWidth, minimumWidth),
  );
}

describe("thread sidebar width", () => {
  it("restores the stored width when the viewport widens after a narrow startup", () => {
    const sidebarWidth = resolveInitialThreadSidebarWidth(350);
    expect(renderedWidth(sidebarWidth, 840)).toBe(208);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(350);
  });

  it("restores the default width when the viewport widens after a narrow startup", () => {
    const sidebarWidth = resolveInitialThreadSidebarWidth(null);
    expect(renderedWidth(sidebarWidth, 840)).toBe(208);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(256);
  });
});
