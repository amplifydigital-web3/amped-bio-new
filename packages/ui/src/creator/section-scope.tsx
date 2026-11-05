"use client";
import type { CSSProperties, ReactNode } from "react";
import type { LibraryThemeSummary } from "@repo/constants";
import { contrastRatio, parseHex, type Rgb } from "../theme-style";
import { cn } from "../utils";

/**
 * The creator section's look (Fan Library FL-4, spec 3.2 and 3.5 Theme scope).
 * Takes the still theme summary the Library API sends and sets the section
 * variables on a container: --c-bg, --c-bg2, --c-surface, --c-ink, --c-muted,
 * --c-line, --c-btn, --c-btnink, the card text pair and the two font families. No particles,
 * name effects, cursor effects or motion.
 *
 * The contrast guard: body text and buttons need 4.5:1, headings 3:1. A pair
 * that fails takes the Graphite values for that pair, and `fallbacks` names it
 * so the client can log library_theme_fallback.
 */

/** Graphite, the dark creator palette (messaging design QA: 16.58:1 and 9.63:1). */
export const GRAPHITE = {
  bg: "#14161c",
  surface: "#1d2029",
  ink: "#f4f5f7",
  muted: "#b9bdc9",
  btn: "#f4f5f7",
  btnInk: "#14161c",
} as const;

const BODY = 4.5;
const HEADING = 3;
const INK: Rgb = { r: 0x16, g: 0x15, b: 0x2b };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

export type SectionFallback = "page" | "surface" | "button" | "muted";

export interface CreatorSectionColors {
  /** The page background: a color, or the creator's gradient */
  background: string;
  /** The solid color the background reads as, for contrast */
  base: string;
  surface: string;
  /** Text on the page */
  ink: string;
  muted: string;
  /** Text on cards and rows */
  surfaceInk: string;
  surfaceMuted: string;
  line: string;
  button: string;
  buttonInk: string;
  nameFont: string | null;
  bodyFont: string | null;
  fallbacks: SectionFallback[];
}

const hex = (rgb: Rgb) =>
  `#${[rgb.r, rgb.g, rgb.b].map(n => Math.round(n).toString(16).padStart(2, "0")).join("")}`;

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => ({
  r: a.r * amount + b.r * (1 - amount),
  g: a.g * amount + b.g * (1 - amount),
  b: a.b * amount + b.b * (1 - amount),
});

/** The first hex color in a gradient: what the page reads as behind text. */
function firstStop(css: string): Rgb | null {
  const match = css.match(/#[0-9a-f]{3,8}\b/i);
  return match ? parseHex(match[0]) : null;
}

export function creatorSectionColors(
  summary: LibraryThemeSummary | null | undefined
): CreatorSectionColors {
  const fallbacks: SectionFallback[] = [];
  const graphite = {
    bg: parseHex(GRAPHITE.bg)!,
    surface: parseHex(GRAPHITE.surface)!,
    ink: parseHex(GRAPHITE.ink)!,
    muted: parseHex(GRAPHITE.muted)!,
  };
  if (!summary) {
    return {
      background: GRAPHITE.bg,
      base: GRAPHITE.bg,
      surface: GRAPHITE.surface,
      ink: GRAPHITE.ink,
      muted: GRAPHITE.muted,
      surfaceInk: GRAPHITE.ink,
      surfaceMuted: GRAPHITE.muted,
      line: "rgba(244, 245, 247, 0.16)",
      button: GRAPHITE.btn,
      buttonInk: GRAPHITE.btnInk,
      nameFont: null,
      bodyFont: null,
      fallbacks: [],
    };
  }

  const text = parseHex(summary.text);
  const container = parseHex(summary.container);
  const bgColor =
    summary.background?.type === "color"
      ? parseHex(summary.background.value)
      : summary.background?.type === "gradient"
        ? firstStop(summary.background.css)
        : null;
  // Image, video and shader scenes send no background: the container color stands in
  let base = bgColor ?? container ?? graphite.bg;
  let background =
    summary.background?.type === "gradient" && bgColor ? summary.background.css : hex(base);
  let ink = text ?? graphite.ink;

  // Page text: headings at 3:1 and the status line at 4.5:1 sit on the page
  if (contrastRatio(ink, base) < BODY) {
    fallbacks.push("page");
    base = graphite.bg;
    background = GRAPHITE.bg;
    ink = graphite.ink;
  }

  // Cards: the creator's container, solid, with their text
  let surface = container ?? mix(ink, base, 0.06);
  let surfaceInk = ink;
  if (contrastRatio(surfaceInk, surface) < BODY) {
    // A container that cannot carry the text: a quiet tint of the page instead
    const tint = mix(ink, base, 0.06);
    if (contrastRatio(ink, tint) >= BODY) surface = tint;
    else {
      fallbacks.push("surface");
      surface = graphite.surface;
      surfaceInk = graphite.ink;
    }
  }

  // Secondary text: the ink toward its background, kept at 4.5:1
  const quiet = (fg: Rgb, bg: Rgb) => {
    for (const amount of [0.72, 0.86]) {
      const candidate = mix(fg, bg, amount);
      if (contrastRatio(candidate, bg) >= BODY) return candidate;
    }
    if (!fallbacks.includes("muted")) fallbacks.push("muted");
    return fg;
  };
  const muted = quiet(ink, base);
  const surfaceMuted = quiet(surfaceInk, surface);

  // The creator's button: their label if it reads, else ink or white, else Graphite
  const buttonColor = parseHex(summary.button);
  const buttonText = parseHex(summary.buttonText);
  let button: string = GRAPHITE.btn;
  let buttonInk: string = GRAPHITE.btnInk;
  if (buttonColor) {
    const label = [buttonText, INK, WHITE].find(
      candidate => candidate && contrastRatio(candidate, buttonColor) >= BODY
    );
    if (label) {
      button = hex(buttonColor);
      buttonInk = hex(label);
    } else fallbacks.push("button");
  } else fallbacks.push("button");

  return {
    background,
    base: hex(base),
    surface: hex(surface),
    ink: hex(ink),
    muted: hex(muted),
    surfaceInk: hex(surfaceInk),
    surfaceMuted: hex(surfaceMuted),
    line: `rgba(${Math.round(ink.r)}, ${Math.round(ink.g)}, ${Math.round(ink.b)}, 0.16)`,
    button,
    buttonInk,
    nameFont: summary.nameFont || null,
    bodyFont: summary.bodyFont || null,
    fallbacks,
  };
}

/** True when a heading in the creator's ink reads on the page (3:1). */
export function headingReads(colors: Pick<CreatorSectionColors, "ink" | "base">) {
  const ink = parseHex(colors.ink);
  const base = parseHex(colors.base);
  return !!ink && !!base && contrastRatio(ink, base) >= HEADING;
}

export function creatorSectionVars(colors: CreatorSectionColors): CSSProperties {
  return {
    "--c-bg": colors.base,
    "--c-bg2": colors.background,
    "--c-surface": colors.surface,
    "--c-ink": colors.ink,
    "--c-muted": colors.muted,
    "--c-surface-ink": colors.surfaceInk,
    "--c-surface-muted": colors.surfaceMuted,
    "--c-line": colors.line,
    "--c-btn": colors.button,
    "--c-btnink": colors.buttonInk,
    "--c-font-name": colors.nameFont
      ? `"${colors.nameFont}", var(--font-prism, sans-serif)`
      : "inherit",
    "--c-font-body": colors.bodyFont
      ? `"${colors.bodyFont}", var(--font-prism, sans-serif)`
      : "inherit",
  } as CSSProperties;
}

/**
 * Wraps a creator section in the creator's look. The rail, top bar, dock,
 * sheets and notices stay outside it and stay Prism.
 */
export function CreatorSectionScope({
  colors,
  className,
  children,
}: {
  colors: CreatorSectionColors;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-creator-section-scope=""
      className={cn("relative", className)}
      style={{
        ...creatorSectionVars(colors),
        background: colors.background,
        color: colors.ink,
        fontFamily: colors.bodyFont ? `"${colors.bodyFont}", sans-serif` : undefined,
      }}
    >
      {children}
    </div>
  );
}
