import type { CSSProperties } from "react";
import type { ThemeConfig } from "@repo/constants";
import { THEME_DEFAULTS } from "@repo/ui";

/**
 * Content surfaces wear only the creator's theme (Prism 2.2 section 17), as the
 * Followers card does: the surface in the button color at the container
 * transparency, text in the creator's font and color. Amped adds no color.
 */
export function creatorSurface(theme: ThemeConfig | undefined): CSSProperties {
  const transparency = theme?.transparency ?? THEME_DEFAULTS.transparency;
  const alpha = Math.round(Math.max(transparency, 40) * 2.55)
    .toString(16)
    .padStart(2, "0");
  const button = theme?.buttonColor || THEME_DEFAULTS.buttonColor;
  return {
    backgroundColor: /^#[0-9a-f]{6}$/i.test(button) ? `${button}${alpha}` : button,
    color: theme?.fontColor || THEME_DEFAULTS.fontColor,
    fontFamily: theme?.fontFamily,
  };
}

export function creatorText(theme: ThemeConfig | undefined): CSSProperties {
  return {
    color: theme?.fontColor || THEME_DEFAULTS.fontColor,
    fontFamily: theme?.fontFamily,
  };
}

/** 2px outline in the creator's text color (039 I13). */
export const CREATOR_FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]";
