import {
  FONT_CATEGORIES,
  FONT_PICK_AXES,
  type FontCatalogEntry,
  type FontCategory,
  type FontPick,
  type FontPickAxis,
} from "./types";

export * from "./types";
export { FONT_PAIRINGS, type FontPairing } from "./pairings";

// Theme Engine v2 fonts, phase 2b (docs/features/theme-engine-v2.md, 3.8).
// Pure helpers shared by the editor picker and both renderers. The catalog
// itself (catalog.json, about 1,900 families) is not imported here: the editor
// loads it lazily from "@repo/constants/src/fonts/catalog.json" when the Text
// row opens, so no app bundle carries it up front.

/** Google family names are letters, digits and spaces. Anything else is refused. */
export const FONT_FAMILY_PATTERN = /^[A-Za-z0-9 ]{1,80}$/;

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  serif: "Serif",
  sans: "Sans",
  display: "Display",
  handwriting: "Handwriting",
  mono: "Mono",
};

export { FONT_CATEGORIES };

/**
 * The ten families the editor and the public page already load on every page
 * (the Google Fonts link in apps/client/index.html and the landing layout).
 * A pick in one of these at 400 to 700 upright needs no extra stylesheet.
 * Phase 2b PR 2 (delivery) replaces that link.
 */
export const BASE_FONT_FAMILIES = [
  "Inter",
  "Montserrat",
  "Open Sans",
  "Poppins",
  "Roboto",
  "Figtree",
  "Bebas Neue",
  "Playfair Display",
  "Lora",
  "Space Grotesk",
] as const;

const BASE_FAMILIES = new Set<string>(BASE_FONT_FAMILIES);
const BASE_WEIGHTS = new Set([400, 500, 600, 700]);

/** The Popular shelf holds the top 24 by rank (spec 3.8). */
export const POPULAR_SHELF_SIZE = 24;

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

/** The weight as the slider reads it: 700 Bold. Off grid weights read the number only. */
export function weightLabel(weight: number): string {
  const name = WEIGHT_NAMES[weight];
  return name ? `${weight} ${name}` : String(weight);
}

/** A generic fallback per category, after the chosen family. */
export const FONT_FALLBACKS: Record<FontCategory, string> = {
  serif: "Georgia, serif",
  sans: "system-ui, sans-serif",
  display: "system-ui, sans-serif",
  handwriting: "cursive",
  mono: "ui-monospace, monospace",
};

/** True when the family has a variable weight axis (the VAR badge). */
export function isVariableFont(entry: FontCatalogEntry): boolean {
  return Boolean(entry.a?.wght);
}

/** The family's catalog entry, matched exactly. */
export function findFont(
  families: readonly FontCatalogEntry[],
  family: string | undefined
): FontCatalogEntry | undefined {
  if (!family) return undefined;
  return families.find(entry => entry.f === family);
}

function byRank(a: FontCatalogEntry, b: FontCatalogEntry): number {
  const ra = a.r ?? Number.POSITIVE_INFINITY;
  const rb = b.r ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.f.localeCompare(b.f);
}

/** Ranked families: popular first, the rest by name. */
export function rankFonts(families: readonly FontCatalogEntry[]): FontCatalogEntry[] {
  return [...families].sort(byRank);
}

/** The Popular shelf: ranked families, top 24. */
export function popularFonts(
  families: readonly FontCatalogEntry[],
  size = POPULAR_SHELF_SIZE
): FontCatalogEntry[] {
  return rankFonts(families.filter(entry => entry.r !== undefined)).slice(0, size);
}

/**
 * Search over family names (spec 3.8): names that start with the query come
 * first, then names that contain it anywhere, each in rank order. An empty
 * query lists the category in rank order. Case and extra spaces are ignored.
 */
export function searchFonts(
  families: readonly FontCatalogEntry[],
  query: string,
  category?: FontCategory
): FontCatalogEntry[] {
  const q = query.trim().replace(/\s+/g, " ").toLowerCase();
  const pool = category ? families.filter(entry => entry.c === category) : families;
  if (!q) return rankFonts(pool);
  const prefix: FontCatalogEntry[] = [];
  const word: FontCatalogEntry[] = [];
  const inside: FontCatalogEntry[] = [];
  for (const entry of pool) {
    const name = entry.f.toLowerCase();
    if (name.startsWith(q)) prefix.push(entry);
    else if (name.includes(` ${q}`)) word.push(entry);
    else if (name.includes(q)) inside.push(entry);
  }
  return [...prefix.sort(byRank), ...word.sort(byRank), ...inside.sort(byRank)];
}

function nearest(values: readonly number[], target: number): number {
  return values.reduce((best, value) =>
    Math.abs(value - target) < Math.abs(best - target) ? value : best
  );
}

/** The weight a family can draw: in the axis range, else the nearest static weight. */
export function fontWeightFor(entry: FontCatalogEntry, weight: number): number {
  const range = entry.a?.wght;
  if (range) return Math.round(Math.min(range[1], Math.max(range[0], weight)));
  return entry.w.length > 0 ? nearest(entry.w, weight) : 400;
}

/** The weight range the slider offers: the axis, or the static weights' span. */
export function fontWeightRange(entry: FontCatalogEntry): [number, number] {
  if (entry.a?.wght) return entry.a.wght;
  if (entry.w.length === 0) return [400, 400];
  return [Math.min(...entry.w), Math.max(...entry.w)];
}

/**
 * A pick the family can draw (spec 3.8): weight on the axis or the nearest
 * static weight, italic only where the family has italics, width and optical
 * size only where the family exposes the axis, each clamped to its range.
 */
export function clampFontPick(entry: FontCatalogEntry, pick: Omit<FontPick, "family">): FontPick {
  const out: FontPick = { family: entry.f };
  if (pick.weight !== undefined) out.weight = fontWeightFor(entry, pick.weight);
  if (pick.italic && entry.i) out.italic = true;
  const axes: Partial<Record<FontPickAxis, number>> = {};
  for (const axis of FONT_PICK_AXES) {
    const range = entry.a?.[axis];
    const value = pick.axes?.[axis];
    if (range && value !== undefined && Number.isFinite(value)) {
      axes[axis] = Math.min(range[1], Math.max(range[0], value));
    }
  }
  if (Object.keys(axes).length > 0) out.axes = axes;
  return out;
}

/** True when the base font link already draws the pick. */
export function fontPickIsLoaded(pick: FontPick): boolean {
  return (
    BASE_FAMILIES.has(pick.family) &&
    BASE_WEIGHTS.has(pick.weight ?? 400) &&
    !pick.italic &&
    !pick.axes?.wdth &&
    !pick.axes?.opsz
  );
}

function uniqueText(text: string): string {
  return Array.from(new Set(Array.from(text.normalize("NFC"))))
    .filter(char => char.trim() !== "")
    .sort()
    .join("");
}

/**
 * The css2 family parameter for one exact face. Axis tags go in alphabetical
 * order (ital, opsz, wdth, wght), as the API requires. The pick is expected to
 * be clamped against the catalog, so every axis named exists on the family.
 */
function familyParam(pick: FontPick): string {
  const name = pick.family.trim().replace(/ /g, "+");
  const tags: string[] = [];
  const values: string[] = [];
  if (pick.italic) {
    tags.push("ital");
    values.push("1");
  }
  for (const axis of ["opsz", "wdth"] as const) {
    const value = pick.axes?.[axis];
    if (value !== undefined) {
      tags.push(axis);
      values.push(String(Math.round(value * 10) / 10));
    }
  }
  tags.push("wght");
  values.push(String(Math.round(pick.weight ?? 400)));
  return `family=${name}:${tags.join(",")}@${values.join(",")}`;
}

/**
 * The stylesheet for picks the base link does not draw, or null when nothing
 * is missing. `text` asks for only those letters (a tile, or the name font).
 *
 * Phase 2b PR 1 (this file's caller list): the editor everywhere, and the
 * public page only while the fontCatalog flag is on, which stays on staging.
 * PR 2 points this at Amped's own font host and the Google host goes away
 * from visitors' browsers (decision 2).
 */
export function fontStylesheetHref(
  picks: readonly FontPick[],
  options: { text?: string; includeLoaded?: boolean } = {}
): string | null {
  const seen = new Set<string>();
  const params: string[] = [];
  for (const pick of picks) {
    if (!FONT_FAMILY_PATTERN.test(pick.family)) continue;
    if (!options.includeLoaded && fontPickIsLoaded(pick)) continue;
    const param = familyParam(pick);
    if (seen.has(param)) continue;
    seen.add(param);
    params.push(param);
  }
  if (params.length === 0) return null;
  const text = options.text ? uniqueText(options.text) : "";
  const tail = text ? `&text=${encodeURIComponent(text)}` : "";
  return `https://fonts.googleapis.com/css2?${params.join("&")}${tail}&display=swap`;
}

/** The CSS a face needs. The family is quoted and followed by its category fallback. */
export interface FontFaceStyle {
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: "italic";
  fontVariationSettings?: string;
}

/** Variation settings for width and optical size, or undefined. */
export function fontVariationSettings(axes: FontPick["axes"]): string | undefined {
  const parts = FONT_PICK_AXES.filter(axis => axes?.[axis] !== undefined).map(
    axis => `"${axis}" ${axes![axis]}`
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function fontFaceStyle(pick: FontPick, category?: FontCategory): FontFaceStyle {
  const fallback = category ? FONT_FALLBACKS[category] : "sans-serif";
  // Phase 2b PR 2: the mirror defines "<Family> Fallback", a local font sized to
  // the family's metrics, so text does not jump when the real font arrives
  const family = FONT_FAMILY_PATTERN.test(pick.family)
    ? `"${pick.family}", "${pick.family} Fallback", ${fallback}`
    : fallback;
  const style: FontFaceStyle = { fontFamily: family };
  if (pick.weight !== undefined) style.fontWeight = pick.weight;
  if (pick.italic) style.fontStyle = "italic";
  const variation = fontVariationSettings(pick.axes);
  if (variation) style.fontVariationSettings = variation;
  return style;
}

/**
 * Drops the catalog font fields from a v1 config. The API calls it on every
 * theme write while the fontCatalog flag is off, so hiding the picker is not
 * the only guard (AGENTS.md, feature flags rule 3).
 */
export function withoutCatalogFonts<T extends { nameFont?: unknown; bodyFontStyle?: unknown }>(
  config: T
): T {
  if (config.nameFont === undefined && config.bodyFontStyle === undefined) return config;
  const { nameFont: _name, bodyFontStyle: _body, ...rest } = config;
  return rest as T;
}
