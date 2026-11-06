// Theme Engine v2 font catalog (docs/features/theme-engine-v2.md, 3.8). The
// catalog file is written by scripts/fonts/build-catalog.ts and loaded lazily
// by the editor when the Text row opens; these types describe its shape.

/** Picker categories, in chip order (board 02). */
export const FONT_CATEGORIES = ["serif", "sans", "display", "handwriting", "mono"] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

/** Variable axes the picker exposes. Weight is a slider, width and optical size too. */
export const FONT_AXES = ["wght", "wdth", "opsz"] as const;
export type FontAxis = (typeof FONT_AXES)[number];

/** Axes a font pick stores besides weight (wght is the pick's weight). */
export const FONT_PICK_AXES = ["wdth", "opsz"] as const;
export type FontPickAxis = (typeof FONT_PICK_AXES)[number];

/**
 * One family in catalog.json. Short keys keep the file small:
 * f family, c category, r popularity rank (1 is most popular; absent when the
 * family is unranked), w static weights, i 1 when the family has italics,
 * a variable axes as [min, max], s language subsets.
 */
export interface FontCatalogEntry {
  f: string;
  c: FontCategory;
  r?: number;
  w: number[];
  i?: 1;
  a?: Partial<Record<FontAxis, [number, number]>>;
  s: string[];
}

export interface FontCatalog {
  /** Where the family list came from, e.g. "google-font-metadata 6.0.8" */
  source: string;
  /** "api" when ranks come from the Google Fonts popularity sort, "curated" otherwise */
  popularity: "api" | "curated";
  count: number;
  families: FontCatalogEntry[];
}

/** A face as a theme stores it: the v1 nameFont field and the v2 fonts slots. */
export interface FontPick {
  family: string;
  weight?: number;
  italic?: boolean;
  axes?: Partial<Record<FontPickAxis, number>>;
}
