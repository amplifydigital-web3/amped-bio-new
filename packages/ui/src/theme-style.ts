import type { CSSProperties } from "react";
import type { ThemeConfig } from "@repo/constants";

// Creator theme helpers shared by the editor (Design destination and the live
// preview) and the public creator page. Screen Review 024 to 030.

/**
 * One set of theme defaults for the Design rows and both renderers
 * (024 I07, 028 I06, 029 I04, 030 I04). The numeric defaults match what
 * public pages already render for a theme that leaves a field unset, so
 * adopting them changes no live page.
 */
export const THEME_DEFAULTS = {
  containerStyle: 0,
  containerColor: "#ffffff",
  transparency: 0,
  buttonStyle: 0,
  buttonColor: "#f3f4f6",
  buttonEffect: 0,
  particlesEffect: 0,
  heroEffect: 0,
  fontFamily: "Inter",
  fontSize: "16px",
  fontColor: "#000000",
} as const;

/** Reads a theme field, falling back to THEME_DEFAULTS. */
export function themeValue<K extends keyof typeof THEME_DEFAULTS>(
  config: Partial<ThemeConfig> | undefined,
  key: K
): (typeof THEME_DEFAULTS)[K] | NonNullable<ThemeConfig[K & keyof ThemeConfig]> {
  const value = config?.[key as keyof ThemeConfig];
  return (value ?? THEME_DEFAULTS[key]) as (typeof THEME_DEFAULTS)[K];
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses #RGB, #RRGGBB or RRGGBB (an alpha suffix is ignored). */
export function parseHex(input: string | undefined | null): Rgb | null {
  if (!input) return null;
  let hex = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex
      .split("")
      .map(c => c + c)
      .join("");
  }
  if (/^[0-9a-f]{8}$/i.test(hex)) hex = hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function rgba(hex: string | undefined, alpha: number): string | undefined {
  const rgb = parseHex(hex);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : undefined;
}

function channel(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance({ r, g, b }: Rgb) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors. */
export function contrastRatio(a: Rgb, b: Rgb) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composites a color at an opacity (0 to 1) over another. */
export function composite(top: Rgb, alpha: number, under: Rgb): Rgb {
  return {
    r: top.r * alpha + under.r * (1 - alpha),
    g: top.g * alpha + under.g * (1 - alpha),
    b: top.b * alpha + under.b * (1 - alpha),
  };
}

function toHsl({ r, g, b }: Rgb) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue(p, q, h + 1 / 3) * 255,
    g: hue(p, q, h) * 255,
    b: hue(p, q, h - 1 / 3) * 255,
  };
}

/** Moves a color's lightness by `delta` (-1 to 1), keeping its hue. */
export function shiftLightness(hex: string, delta: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const { h, s, l } = toHsl(rgb);
  return toHex(fromHsl(h, s, Math.min(1, Math.max(0, l + delta))));
}

/**
 * The nearest shade of the same hue whose contrast against `against` reaches
 * `target`. Used by Fix contrast (024 I06, 025 I04, 026 I05).
 */
export function nearestPassingShade(hex: string, against: Rgb, target: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (contrastRatio(rgb, against) >= target) return toHex(rgb);
  const { h, s, l } = toHsl(rgb);
  for (let step = 0.01; step <= 1; step += 0.01) {
    for (const next of [l - step, l + step]) {
      if (next < 0 || next > 1) continue;
      const candidate = fromHsl(h, s, next);
      if (contrastRatio(candidate, against) >= target) return toHex(candidate);
    }
  }
  return luminance(against) > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * CSS variables the renderers read so button and container styles follow the
 * creator's own colors instead of fixed blue and purple (024 I03, 025 I02,
 * 028 I04, 030 I03).
 */
export function themeCssVars(config: Partial<ThemeConfig> | undefined): CSSProperties {
  const button = config?.buttonColor || THEME_DEFAULTS.buttonColor;
  const container = config?.containerColor || THEME_DEFAULTS.containerColor;
  const font = config?.fontColor || THEME_DEFAULTS.fontColor;
  return {
    "--amped-btn": button,
    "--amped-btn-dark": shiftLightness(button, -0.2),
    "--amped-glow": rgba(button, 0.5),
    "--amped-container": container,
    "--amped-name-glow": rgba(font, 0.7),
  } as CSSProperties;
}

// Name effects: colors each effect paints, for the name guard (030 I03)
export const NAME_EFFECT_COLORS: Record<number, string[]> = {
  7: ["#FF00FF"],
  8: ["#FF0000", "#FF8000", "#FFFF00", "#00FF00", "#0000FF", "#8000FF"],
};
