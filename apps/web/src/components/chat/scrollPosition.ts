export const SCROLL_END_THRESHOLD_PX = 8;

export type VerticalScrollMetrics = Pick<
  HTMLElement,
  "clientHeight" | "scrollHeight" | "scrollTop"
>;

export function getVerticalScrollEndState(
  element: VerticalScrollMetrics,
  threshold = SCROLL_END_THRESHOLD_PX,
) {
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const distanceFromBottom = maxScrollTop - element.scrollTop;

  return {
    canScrollDown: distanceFromBottom > threshold,
    isAtEnd: maxScrollTop <= threshold || distanceFromBottom <= threshold,
  };
}
