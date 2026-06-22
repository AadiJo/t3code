export const MARKDOWN_VIEW_MODES = ["raw", "preview"] as const;
export type MarkdownViewMode = (typeof MARKDOWN_VIEW_MODES)[number];

export interface ThreadMarkdownViewPreferenceState {
  markdownViewMode: MarkdownViewMode;
}

export const DEFAULT_THREAD_MARKDOWN_VIEW_PREFERENCE_STATE: ThreadMarkdownViewPreferenceState =
  Object.freeze({
    markdownViewMode: "raw",
  });

export const isMarkdownPreviewFile = (path: string): boolean => /\.(?:md|mdx)$/i.test(path);

export function shouldRenderMarkdownPreview(input: {
  isMarkdown: boolean;
  markdownViewMode: MarkdownViewMode;
  revealLine: number | null;
  hasRevealOverride: boolean;
}): boolean {
  if (!input.isMarkdown || input.markdownViewMode !== "preview") {
    return false;
  }

  return input.revealLine === null || input.hasRevealOverride;
}

export function setMarkdownTaskChecked(
  markdown: string,
  markerOffset: number,
  checked: boolean,
): string {
  if (
    markerOffset < 0 ||
    markdown[markerOffset] !== "[" ||
    !/[ xX]/.test(markdown[markerOffset + 1] ?? "") ||
    markdown[markerOffset + 2] !== "]"
  ) {
    return markdown;
  }

  return `${markdown.slice(0, markerOffset + 1)}${checked ? "x" : " "}${markdown.slice(markerOffset + 2)}`;
}
