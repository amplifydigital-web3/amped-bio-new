"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AnyThemeConfig } from "@repo/constants";
import { cn } from "../utils";
import { effectClassName, lookFor } from "./look";

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
  const className = cn(
    "flex min-h-commit w-full items-center gap-[13px] px-[21px] py-2",
    effectClassName(look.button),
    effectClassName(look.buttonHover),
    CREATOR_FOCUS
  );
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
        className="line-clamp-2 flex-1 break-words text-center font-semibold"
        style={{ fontSize: clampedFontSize(theme), lineHeight: "20px" }}
      >
        {label}
        {href && newTab && <span className="sr-only"> (opens in a new tab)</span>}
      </span>
      <span aria-hidden className="w-[21px] shrink-0" />
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={newTab ? "_blank" : undefined}
        rel={newTab ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className={className}
        style={style}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}
