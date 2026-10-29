"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { AnyThemeConfig, EffectEntry, ThemeColors } from "@repo/constants";
import { cn } from "../utils";
import { effectClassName, lookFor } from "./look";
import { buttonSurfaceClass } from "./surface";

// Screen Review 040: shared pieces of the creator page block renderer. Blocks
// wear only the creator's theme (section 17). Amped contributes rhythm, sizes
// and rendering quality, never color. Moved here from the public page's
// blocks/frame.tsx in Theme Engine v2 phase 1b so the editor preview and the
// public page draw the same button from the effect registry.

/** Creator font size clamped to 16 to 20 (040 I06, I10). */
export function clampedFontSize(theme: AnyThemeConfig | null | undefined) {
  const raw = parseFloat(String(lookFor(theme).values.fontSize ?? "16"));
  const size = Number.isFinite(raw) ? Math.min(20, Math.max(16, raw)) : 16;
  return `${size}px`;
}

/** 039 I13: focus shows a 2px outline in the creator's text color. */
export const CREATOR_FOCUS =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]";

/**
 * Plays a WAAPI press effect (Ripple) from the press point: one span sized to
 * 2.5 times the button width, removed when it finishes. Never delays the
 * click, and plays nothing under reduced motion (decision 6, spec 3.5).
 */
export function playPress(
  entry: EffectEntry,
  colors: ThemeColors,
  event: PointerEvent<HTMLElement>
): void {
  if (entry.render.kind !== "waapi" || entry.render.trigger !== "press") return;
  const button = event.currentTarget;
  if (typeof button.animate !== "function") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const box = button.getBoundingClientRect();
  const size = box.width * 2.5;
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  Object.assign(dot.style, {
    position: "absolute",
    left: `${event.clientX - box.left}px`,
    top: `${event.clientY - box.top}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "50%",
    pointerEvents: "none",
  });
  button.appendChild(dot);
  const params = {};
  const animation = dot.animate(
    entry.render.keyframes(params, colors) as Keyframe[],
    entry.render.options(params) as KeyframeAnimationOptions
  );
  const remove = () => dot.remove();
  animation.onfinish = remove;
  animation.oncancel = remove;
}

/**
 * 040 I06: one button anatomy for link, referral and pool calls to action.
 * Full column width, min 55, a 21 icon at left, the label centered on the
 * button (a 21 spacer at right balances the icon), two lines then truncate.
 * The surface and hover come from the registry (button and buttonHover).
 */
export function CreatorButton({
  theme,
  icon,
  label,
  href,
  onClick,
  newTab = true,
}: {
  theme: AnyThemeConfig | null | undefined;
  icon?: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  newTab?: boolean;
}) {
  const look = lookFor(theme);
  // Phase 2 Buttons row (board 07): Label is the v1 anatomy; Icon slot sets
  // the label beside the icon; Split adds a chevron at the right
  const layout = look.v2.button.layout;
  // Phase 2 Button press row: a class press (Dip) or a ripple from the press point
  const press = look.buttonPress;
  const ripple = press.render.kind === "waapi";
  const className = cn(
    "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
    effectClassName(look.button),
    buttonSurfaceClass(look),
    effectClassName(look.buttonHover),
    effectClassName(press),
    ripple && "relative overflow-hidden",
    CREATOR_FOCUS
  );
  const onPointerDown = ripple
    ? (event: PointerEvent<HTMLElement>) => playPress(press, look.colors, event)
    : undefined;
  const style: CSSProperties = {
    backgroundColor: look.values.buttonColor,
    fontFamily: look.values.fontFamily,
    color: look.values.fontColor,
  };
  const content = (
    <>
      <span aria-hidden className="flex h-[21px] w-[21px] shrink-0 items-center justify-center">
        {icon}
      </span>
      <span
        className={cn(
          "line-clamp-2 flex-1 break-words font-semibold",
          layout === "label" ? "text-center" : "text-left"
        )}
        style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
      >
        {label}
        {href && newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </span>
      {layout === "split" ? (
        <ChevronRight aria-hidden className="h-[21px] w-[21px] shrink-0 opacity-70" />
      ) : layout === "label" ? (
        <span aria-hidden className="w-[21px] shrink-0" />
      ) : null}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        onClick={onClick}
        onPointerDown={onPointerDown}
        className={className}
        style={style}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}
