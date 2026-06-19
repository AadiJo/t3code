import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { isElectron } from "~/env";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

const PREVIEW_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
const PREVIEW_PANEL_MIN_WIDTH = 360;
/** Hard ceiling so a wide monitor can't yield a panel that swallows the chat. */
const PREVIEW_PANEL_MAX_WIDTH_PX = 1400;
/** Fraction of the viewport allowed; the panel is min(this · vw, MAX_PX). */
const PREVIEW_PANEL_MAX_WIDTH_FRACTION = 0.7;
const PREVIEW_PANEL_DEFAULT_WIDTH = 540;
const PANEL_MOTION_FALLBACK_MS = 450;

/**
 * Shell for the preview panel. In inline mode the panel is user-resizable
 * via a drag handle on the left edge; width persists per browser. In
 * sheet/sidebar modes the parent owns the size.
 */
export function PreviewPanelShell(props: {
  mode: PreviewPanelMode;
  maximized?: boolean;
  open?: boolean;
  onLayoutTransitionChange?: (isAnimating: boolean) => void;
  children: ReactNode;
}) {
  const useDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";
  const isInline = props.mode === "inline";
  const isOpen = props.open ?? true;
  const isMaximized = Boolean(props.maximized);
  const shellRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const [isFlexExpanded, setIsFlexExpanded] = useState(isOpen);
  const isFlexExpandedRef = useRef(isFlexExpanded);
  isFlexExpandedRef.current = isFlexExpanded;
  const [isAnimating, setIsAnimating] = useState(false);
  const viewportWidth = useViewportWidth();
  const maxWidth = getViewportClampedMaxWidth(viewportWidth);

  const disableTransitions = useCallback(() => {
    shellRef.current?.style.setProperty("transition-duration", "0ms");
  }, []);

  const restoreTransitions = useCallback(() => {
    shellRef.current?.style.removeProperty("transition-duration");
  }, []);

  const { width, handlers } = useResizableWidth({
    storageKey: PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: PREVIEW_PANEL_DEFAULT_WIDTH,
    minWidth: PREVIEW_PANEL_MIN_WIDTH,
    maxWidth,
    resizeBasis: viewportWidth,
    edge: "left",
    onDragStart: disableTransitions,
    onDragEnd: restoreTransitions,
  });

  const setLayoutAnimating = useCallback(
    (next: boolean) => {
      setIsAnimating(next);
      props.onLayoutTransitionChange?.(next);
    },
    [props.onLayoutTransitionChange],
  );

  useLayoutEffect(() => {
    if (!isInline) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsFlexExpanded(isOpen);
      setLayoutAnimating(false);
      return;
    }

    if (isOpen) {
      setIsFlexExpanded(false);
      setLayoutAnimating(true);
      let nestedFrameId = 0;
      const frameId = window.requestAnimationFrame(() => {
        shellRef.current?.getBoundingClientRect();
        nestedFrameId = window.requestAnimationFrame(() => {
          setIsFlexExpanded(true);
        });
      });
      return () => {
        window.cancelAnimationFrame(frameId);
        if (nestedFrameId !== 0) {
          window.cancelAnimationFrame(nestedFrameId);
        }
      };
    }

    setLayoutAnimating(true);
    setIsFlexExpanded(false);
  }, [isInline, isOpen, setLayoutAnimating]);

  useEffect(() => {
    if (!isInline) return;

    const shell = shellRef.current;
    if (!shell) return;

    const finishAnimation = () => {
      const expanded = isFlexExpandedRef.current;
      const open = isOpenRef.current;
      if (open !== expanded) return;
      setLayoutAnimating(false);
    };

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== shell) return;
      if (event.propertyName !== "width" && event.propertyName !== "flex-basis") return;
      finishAnimation();
    };

    shell.addEventListener("transitionend", onTransitionEnd);
    const timeoutId = window.setTimeout(finishAnimation, PANEL_MOTION_FALLBACK_MS);
    return () => {
      shell.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timeoutId);
    };
  }, [isFlexExpanded, isInline, setLayoutAnimating]);

  const inlineStyle = isInline
    ? isMaximized
      ? { flex: isFlexExpanded ? "1 1 0%" : "0 0 0px", minWidth: 0 }
      : { flex: "0 0 auto", width: isFlexExpanded ? width : 0, minWidth: 0 }
    : undefined;

  const panelBody = (
    <>
      {useDragRegion ? <div className="electron-drag-region h-0 w-full" aria-hidden /> : null}
      {props.children}
    </>
  );

  return (
    <div
      ref={shellRef}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col self-stretch bg-background",
        isInline && "right-panel-motion border-l border-border",
        isInline && isMaximized ? "min-w-0 flex-1" : isInline ? "shrink-0" : "w-full",
      )}
      data-panel-open={isOpen ? "true" : "false"}
      data-panel-animating={isAnimating ? "true" : "false"}
      data-preview-panel-maximized={isMaximized ? "true" : "false"}
      style={inlineStyle}
      data-preview-panel-mode={props.mode}
    >
      {isInline && !isMaximized ? <RightPanelResizeHandle handlers={handlers} /> : null}
      {isInline ? (
        <div
          className="flex h-full min-w-0 flex-col"
          style={{
            width: isMaximized ? "100%" : width,
            minWidth: isMaximized ? 0 : width,
          }}
        >
          {panelBody}
        </div>
      ) : (
        panelBody
      )}
    </div>
  );
}

/**
 * Track viewport width so the right panel can resize proportionally with the
 * window while still enforcing a sensible upper bound.
 */
function useViewportWidth(): number {
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      // Coalesce rapid resize events into one rAF tick.
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setVw(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);
  return vw;
}

function getViewportClampedMaxWidth(viewportWidth: number): number {
  return Math.min(
    PREVIEW_PANEL_MAX_WIDTH_PX,
    Math.floor(viewportWidth * PREVIEW_PANEL_MAX_WIDTH_FRACTION),
  );
}
