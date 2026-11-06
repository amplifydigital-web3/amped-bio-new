"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AnyThemeConfig } from "@repo/constants";
import { contrastRatio, parseHex, type Rgb } from "../theme-style";
import { cn } from "../utils";
import { lookCssVars, lookFontColor, lookFor, type CreatorLook } from "./look";

/**
 * Mobile checkout (docs/features/mobile-checkout.md 5, CK-2): the creator's look for a
 * money sheet, shared with the Fan Library (FL-4). The header, cover and button color
 * come from the creator theme; the figures and legal lines sit on a solid surface that
 * always reads. No particles, motion or background image inside the sheet.
 */

const INK: Rgb = { r: 0x16, g: 0x15, b: 0x2b };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BODY_CONTRAST = 4.5;

const hex = (rgb: Rgb) =>
  `#${[rgb.r, rgb.g, rgb.b].map(n => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

export interface MoneySheetColors {
  /** The sheet surface: the creator's container color, solid, or white when text cannot read on it. */
  surface: string;
  /** Body text on the surface. */
  text: string;
  /** The commit button. */
  button: { background: string; color: string; border: string };
  /** Behind the sheet: the creator's background, dimmed by the frame. */
  backdrop: CSSProperties;
  /** True when the creator's button failed 4.5:1 and the guard took over. */
  guarded: boolean;
}

function backdropStyle(look: CreatorLook): CSSProperties {
  const background = look.values.background;
  if (background?.type === "image" && background.value) {
    return {
      backgroundImage: `url("${background.value}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (background?.type === "video" && background.thumbnail) {
    return {
      backgroundImage: `url("${background.thumbnail}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (background?.type === "color" && background.value) return { background: background.value };
  return { background: "#F4F3FA" };
}

/**
 * The legibility guard. The creator's button keeps its color when its label reads at
 * 4.5:1; otherwise the button turns neutral with the creator's color as its border, so
 * the brand stays and the label reads.
 */
export function moneySheetColors(theme: AnyThemeConfig | null | undefined): MoneySheetColors {
  const look = lookFor(theme);
  const font = parseHex(lookFontColor(look)) ?? INK;
  const container = parseHex(look.colors.container) ?? WHITE;
  const surfaceReads = contrastRatio(font, container) >= BODY_CONTRAST;
  const surface = surfaceReads ? container : WHITE;
  const text = surfaceReads ? font : INK;

  const buttonColor = parseHex(look.colors.button) ?? INK;
  const labelOnButton = contrastRatio(font, buttonColor) >= BODY_CONTRAST;
  const inkOnButton = contrastRatio(INK, buttonColor) >= BODY_CONTRAST;
  const whiteOnButton = contrastRatio(WHITE, buttonColor) >= BODY_CONTRAST;
  const label = labelOnButton ? font : inkOnButton ? INK : whiteOnButton ? WHITE : null;

  const button = label
    ? { background: hex(buttonColor), color: hex(label), border: hex(buttonColor) }
    : { background: hex(surface), color: hex(text), border: hex(buttonColor) };

  return {
    surface: hex(surface),
    text: hex(text),
    button,
    backdrop: backdropStyle(look),
    guarded: !labelOnButton,
  };
}

/**
 * Wraps a money sheet in the creator's font, colors and theme variables. The figures
 * inside use `font-prism tabular-nums` and ignore the creator font on purpose.
 */
export function CreatorThemeScope({
  theme,
  className,
  children,
}: {
  theme: AnyThemeConfig | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const look = lookFor(theme);
  const colors = moneySheetColors(theme);
  return (
    <div
      data-creator-theme-scope=""
      className={cn("relative", className)}
      style={{
        ...lookCssVars(look),
        fontFamily: look.values.fontFamily || undefined,
        color: colors.text,
      }}
    >
      {children}
    </div>
  );
}
