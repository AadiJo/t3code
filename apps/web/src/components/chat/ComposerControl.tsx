import { mergeProps } from "@base-ui/react/merge-props";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { useRender } from "@base-ui/react/use-render";
import type { ComponentType, SVGProps } from "react";

import { cn } from "~/lib/utils";

export type ComposerControlSize = "sm" | "xs";

/**
 * The composer toolbar's control look. `sm` is the expanded toolbar; `xs` is the dimmer resting
 * strip. `aria-pressed` marks a toggle that is on (plan mode). This is an app control, not a
 * restyled Button, so it owns its classes. Menu triggers open on pointer release and set
 * `data-composer-control-open`, so they show the press effect and stay lit while open.
 */
function composerControlClassName(size: ComposerControlSize, className?: string) {
  return cn(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent text-base outline-none transition-[background-color,color,scale] duration-150 ease-out hover:bg-sidebar-row-hover data-pressed:bg-sidebar-row-hover data-[composer-control-open=true]:bg-sidebar-row-hover data-[composer-control-open=true]:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 data-disabled:pointer-events-none data-disabled:opacity-64 pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-mx-0.5 [&_svg[data-composer-control-icon]]:mx-0",
    "[&_:is([data-composer-control-label],[data-chat-provider-model-picker-label])]:[text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:[&_:is([data-composer-control-label],[data-chat-provider-model-picker-label])]:py-1.5",
    size === "xs"
      ? "h-7 gap-1 has-[[data-composer-label]]:gap-1.5 px-1.75 font-normal text-foreground/70 text-sm hover:text-foreground dark:text-muted-foreground sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:mx-0 [&_svg[data-composer-control-chevron]]:ms-0 [&_svg[data-composer-control-chevron]]:-me-1"
      : "h-7 gap-1.5 px-2 font-medium text-foreground/80 [&_svg:not([class*='text-'])]:text-muted-foreground hover:text-foreground sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
    "aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:hover:bg-accent/80",
    className,
  );
}

/**
 * The composer's square icon actions (send, attach, and back/continue through questions) share
 * one quiet hover box so the footer reads as a single control set. `stageBackdrop` is the send
 * button over environment artwork.
 */
export function composerIconActionClassName(stageBackdrop = false) {
  return cn(
    "relative isolate flex size-8 items-center justify-center overflow-hidden rounded-md bg-transparent transition-[background-color,color,scale] duration-150 ease-out enabled:active:scale-[0.97] enabled:cursor-pointer disabled:pointer-events-none disabled:opacity-35 sm:size-7 [&_svg]:pointer-events-none",
    stageBackdrop
      ? "text-white enabled:hover:brightness-110"
      : "text-secondary-label enabled:hover:bg-sidebar-row-hover enabled:hover:text-foreground enabled:active:bg-accent",
  );
}

type ComposerControlProps = useRender.ComponentProps<"button"> & {
  size?: ComposerControlSize;
};

export function ComposerControl({
  className,
  size = "sm",
  render,
  ...props
}: ComposerControlProps) {
  const defaultProps = {
    className: composerControlClassName(size, className),
    type: render ? undefined : ("button" as const),
  };
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export function ComposerControlIcon({
  icon: Icon,
  className,
  opticalSize = "default",
  size = "sm",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string | undefined;
  opticalSize?: "default" | "large";
  size?: ComposerControlSize;
}) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "shrink-0",
        size === "xs" ? "size-3" : opticalSize === "large" ? "size-4.5" : "size-4",
        className,
      )}
      data-composer-control-icon
    />
  );
}

export function ComposerSelectControl({
  className,
  children,
  size = "sm",
  ...props
}: Omit<SelectPrimitive.Trigger.Props, "className"> & {
  className?: string | undefined;
  size?: ComposerControlSize;
}) {
  return (
    <SelectPrimitive.Trigger className={composerControlClassName(size, className)} {...props}>
      {children}
    </SelectPrimitive.Trigger>
  );
}
