import { describe, expect, it } from "vitest";
import catalogJson from "../src/fonts/catalog.json";
import {
  BASE_FONT_FAMILIES,
  FONT_CATEGORIES,
  FONT_FAMILY_PATTERN,
  FONT_PAIRINGS,
  POPULAR_SHELF_SIZE,
  clampFontPick,
  findFont,
  fontFaceStyle,
  fontPickIsLoaded,
  fontStylesheetHref,
  fontWeightFor,
  isVariableFont,
  popularFonts,
  searchFonts,
  themeConfigSchema,
  upgradeTheme,
  weightLabel,
  withoutCatalogFonts,
  type FontCatalog,
  type FontCatalogEntry,
} from "../src/index";

// Theme Engine v2 phase 2b, fonts PR 1 (spec 3.8, board 02).

const catalog = catalogJson as unknown as FontCatalog;
const families = catalog.families;
const font = (family: string) => {
  const entry = findFont(families, family);
  if (!entry) throw new Error(`${family} missing from the catalog`);
  return entry;
};

describe("font catalog file", () => {
  it("lists the Google Fonts catalog with a count that matches", () => {
    expect(catalog.count).toBe(families.length);
    expect(families.length).toBeGreaterThan(1800);
    expect(catalog.source).toMatch(/^google-font-metadata /);
    expect(["api", "curated"]).toContain(catalog.popularity);
  });

  it("has one entry per family, each with a safe name, a category, weights and subsets", () => {
    const names = new Set<string>();
    for (const entry of families) {
      expect(names.has(entry.f)).toBe(false);
      names.add(entry.f);
      expect(entry.f).toMatch(FONT_FAMILY_PATTERN);
      expect(FONT_CATEGORIES).toContain(entry.c);
      expect(entry.w.length).toBeGreaterThan(0);
      for (const w of entry.w) expect(w % 100).toBe(0);
      expect(entry.s.length).toBeGreaterThan(0);
      if (entry.i !== undefined) expect(entry.i).toBe(1);
      for (const [axis, range] of Object.entries(entry.a ?? {})) {
        expect(["wght", "wdth", "opsz"]).toContain(axis);
        expect(range![0]).toBeLessThanOrEqual(range![1]);
      }
    }
  });

  it("ranks at least a full Popular shelf with unique ranks", () => {
    const ranked = families.filter(entry => entry.r !== undefined);
    expect(ranked.length).toBeGreaterThanOrEqual(POPULAR_SHELF_SIZE);
    expect(new Set(ranked.map(entry => entry.r)).size).toBe(ranked.length);
  });

  it("carries every base family and every pairing family", () => {
    for (const family of BASE_FONT_FAMILIES) expect(findFont(families, family)).toBeDefined();
    expect(FONT_PAIRINGS).toHaveLength(24);
    for (const pairing of FONT_PAIRINGS) {
      expect(findFont(families, pairing.name), pairing.name).toBeDefined();
      expect(findFont(families, pairing.body), pairing.body).toBeDefined();
    }
  });

  it("records variable axes where the family has them", () => {
    expect(isVariableFont(font("Fraunces"))).toBe(true);
    expect(font("Fraunces").a?.opsz).toEqual([9, 144]);
    expect(isVariableFont(font("Bebas Neue"))).toBe(false);
  });
});

describe("Popular shelf and search", () => {
  it("shows the top 24 by rank", () => {
    const shelf = popularFonts(families);
    expect(shelf).toHaveLength(POPULAR_SHELF_SIZE);
    for (let i = 1; i < shelf.length; i++) expect(shelf[i].r!).toBeGreaterThan(shelf[i - 1].r!);
  });

  it("puts prefix matches first, then word starts, then substrings", () => {
    const results = searchFonts(families, "  ROBOTO ").map(entry => entry.f);
    expect(results[0]).toBe("Roboto");
    expect(results.every(name => name.toLowerCase().includes("roboto"))).toBe(true);
    const sans = searchFonts(families, "sans").map(entry => entry.f);
    const firstInside = sans.findIndex(name => !/(^| )sans/i.test(name));
    if (firstInside >= 0) {
      expect(sans.slice(firstInside).every(name => !/(^| )sans/i.test(name))).toBe(true);
    }
  });

  it("filters by category and returns nothing for an unknown name", () => {
    expect(searchFonts(families, "", "mono").every(entry => entry.c === "mono")).toBe(true);
    expect(searchFonts(families, "zzzz-no-such-font")).toEqual([]);
  });
});

describe("font picks", () => {
  const staticFont: FontCatalogEntry = { f: "Static", c: "sans", w: [400, 700], s: ["latin"] };

  it("keeps weights on the axis and snaps static families to a weight they have", () => {
    expect(fontWeightFor(font("Fraunces"), 950)).toBe(900);
    expect(fontWeightFor(staticFont, 600)).toBe(700);
    expect(fontWeightFor(staticFont, 300)).toBe(400);
  });

  it("drops italics and axes the family does not have and clamps the rest", () => {
    expect(
      clampFontPick(font("Bebas Neue"), { weight: 700, italic: true, axes: { wdth: 80 } })
    ).toEqual({ family: "Bebas Neue", weight: 400 });
    expect(
      clampFontPick(font("Fraunces"), { weight: 700, italic: true, axes: { opsz: 500 } })
    ).toEqual({ family: "Fraunces", weight: 700, italic: true, axes: { opsz: 144 } });
  });

  it("names weights as the slider reads them", () => {
    expect(weightLabel(700)).toBe("700 Bold");
    expect(weightLabel(350)).toBe("350");
  });

  it("writes a quoted family with its fallback and variation settings", () => {
    expect(fontFaceStyle({ family: "Fraunces", weight: 700, axes: { opsz: 72 } }, "serif")).toEqual(
      {
        fontFamily: '"Fraunces", Georgia, serif',
        fontWeight: 700,
        fontVariationSettings: '"opsz" 72',
      }
    );
    expect(fontFaceStyle({ family: "bad;family" }).fontFamily).toBe("sans-serif");
  });
});

describe("font stylesheet", () => {
  it("asks for the exact face with axes in alphabetical order and only the needed letters", () => {
    const href = fontStylesheetHref(
      [{ family: "Fraunces", weight: 700, italic: true, axes: { opsz: 72 } }],
      { text: "Maya Rivera" }
    );
    expect(href).toBe(
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,72,700&text=MRaeirvy&display=swap"
    );
  });

  it("skips faces the base link already draws and refuses unsafe names", () => {
    expect(fontPickIsLoaded({ family: "Inter", weight: 700 })).toBe(true);
    expect(fontStylesheetHref([{ family: "Inter", weight: 400 }])).toBeNull();
    expect(fontStylesheetHref([{ family: "Inter", weight: 300 }])).toContain(
      "family=Inter:wght@300"
    );
    expect(fontStylesheetHref([{ family: "x&y=z" }])).toBeNull();
  });

  it("asks once for a repeated face", () => {
    const href = fontStylesheetHref([
      { family: "Syne", weight: 700 },
      { family: "Syne", weight: 700 },
    ]);
    expect(href?.match(/family=/g)).toHaveLength(1);
  });
});

describe("theme fields", () => {
  it("accepts a catalog name face and body style and refuses an unsafe family", () => {
    expect(
      themeConfigSchema.safeParse({
        fontFamily: "Figtree",
        nameFont: { family: "Fraunces", weight: 700, axes: { opsz: 72 } },
        bodyFontStyle: { weight: 500, italic: true },
      }).success
    ).toBe(true);
    expect(themeConfigSchema.safeParse({ nameFont: { family: "a</style>" } }).success).toBe(false);
    expect(
      themeConfigSchema.safeParse({ nameFont: { family: "Fraunces", axes: { slnt: 4 } } }).success
    ).toBe(false);
  });

  it("upgrades the name face and the body style into v2 fonts", () => {
    const v2 = upgradeTheme({
      fontFamily: "Figtree",
      nameFont: { family: "Fraunces", weight: 800, italic: true, axes: { opsz: 72 } },
      bodyFontStyle: { weight: 500 },
    });
    expect(v2.fonts.name).toEqual({
      family: "Fraunces",
      weight: 800,
      italic: true,
      axes: { opsz: 72 },
    });
    expect(v2.fonts.body).toEqual({ family: "Figtree", weight: 500, italic: false, axes: {} });
  });

  it("keeps the v1 look for a theme with neither field", () => {
    const v2 = upgradeTheme({ fontFamily: "Lora" });
    expect(v2.fonts.name).toEqual({ family: "Lora", weight: 700, italic: false, axes: {} });
    expect(v2.fonts.body).toEqual({ family: "Lora", weight: 400, italic: false, axes: {} });
  });

  it("drops the catalog fields for the server guard and keeps everything else", () => {
    const config = {
      fontFamily: "Lora",
      nameFont: { family: "Syne" },
      bodyFontStyle: { weight: 500 },
    };
    expect(withoutCatalogFonts(config)).toEqual({ fontFamily: "Lora" });
    const plain = { fontFamily: "Lora" };
    expect(withoutCatalogFonts(plain)).toBe(plain);
  });
});
