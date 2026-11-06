import { describe, expect, it } from "vitest";
import {
  creatorFontRequests,
  findEffect,
  fontRangeStylesheetHref,
  isGoogleFontsStylesheet,
  weightPulseParams,
  weightPulseRange,
  withoutCatalogFonts,
  type FontCatalogEntry,
} from "../src";

// Theme Engine v2 TE-3e2 (spec 3.5): Weight pulse on the font catalog

const VARIABLE: FontCatalogEntry = {
  f: "Fraunces",
  c: "serif",
  w: [100, 900],
  a: { wght: [100, 900] },
  s: ["latin"],
};
const NARROW: FontCatalogEntry = {
  f: "Lora",
  c: "serif",
  w: [400, 700],
  a: { wght: [400, 700] },
  s: ["latin"],
};
const SHALLOW: FontCatalogEntry = {
  f: "Thin",
  c: "sans-serif",
  w: [400, 500],
  a: { wght: [400, 500] },
  s: ["latin"],
};
const STATIC: FontCatalogEntry = { f: "Bebas Neue", c: "display", w: [400], s: ["latin"] };

describe("weightPulseRange", () => {
  it("is the family's wght axis inside 300 to 900", () => {
    expect(weightPulseRange(VARIABLE)).toEqual([300, 900]);
    expect(weightPulseRange(NARROW)).toEqual([400, 700]);
  });

  it("is null without an axis at least 200 wide", () => {
    expect(weightPulseRange(STATIC)).toBeNull();
    expect(weightPulseRange(SHALLOW)).toBeNull();
    expect(weightPulseRange(undefined)).toBeNull();
  });
});

describe("weightPulseParams", () => {
  it("defaults to the full range", () => {
    expect(weightPulseParams(VARIABLE)).toEqual({ lightest: 300, boldest: 900 });
  });

  it("clamps stored values into the axis, in order, 100 apart", () => {
    expect(weightPulseParams(NARROW, { lightest: 300, boldest: 900 })).toEqual({
      lightest: 400,
      boldest: 700,
    });
    expect(weightPulseParams(VARIABLE, { lightest: 800, boldest: 400 })).toEqual({
      lightest: 400,
      boldest: 800,
    });
    expect(weightPulseParams(VARIABLE, { lightest: 600, boldest: 620 })).toEqual({
      lightest: 600,
      boldest: 700,
    });
    expect(weightPulseParams(STATIC, { lightest: 300 })).toBeNull();
  });
});

describe("the font request", () => {
  it("asks for the range with only the name's letters", () => {
    const href = fontRangeStylesheetHref({ family: "Fraunces" }, [300, 900], { text: "Maya" });
    expect(href).toBe(
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@300..900&text=May&display=swap"
    );
    expect(isGoogleFontsStylesheet(href!)).toBe(true);
    expect(fontRangeStylesheetHref({ family: "Bad;Family" }, [300, 900])).toBeNull();
    expect(fontRangeStylesheetHref({ family: "Fraunces" }, [500, 500])).toBeNull();
  });

  it("falls back to the plain name face when the range cannot be requested", () => {
    // An equal or out of range pair (an API write the editor would not make)
    const requests = creatorFontRequests(
      {
        fontFamily: "Inter",
        nameFont: { family: "Fraunces", weight: 700 },
        heroEffectId: "name.weight-pulse",
        heroEffectParams: { lightest: 500, boldest: 500 },
      } as never,
      { name: "Rob" }
    );
    expect(requests[0]?.role).toBe("name");
    expect(requests[0]?.url).toContain("wght@700");
  });

  it("creatorFontRequests names the range face first, even when the name uses the body family", () => {
    const requests = creatorFontRequests(
      {
        fontFamily: "Inter",
        heroEffectId: "name.weight-pulse",
        heroEffectParams: { lightest: 400, boldest: 800 },
      } as never,
      { name: "Rob" }
    );
    expect(requests[0]).toEqual({
      role: "name",
      url: "https://fonts.googleapis.com/css2?family=Inter:wght@400..800&text=Rbo&display=swap",
    });
  });
});

describe("the registry entry and the flag guard", () => {
  it("is a Plus pointer effect with Lightest and Boldest", () => {
    const entry = findEffect("name.weight-pulse")!;
    expect(entry.tier).toBe("plus");
    expect(entry.pointer).toBe("fine");
    expect(Object.keys(entry.params)).toEqual(["lightest", "boldest"]);
  });

  it("withoutCatalogFonts drops Weight pulse with the catalog fields", () => {
    expect(
      withoutCatalogFonts({
        fontFamily: "Inter",
        heroEffect: 0,
        heroEffectId: "name.weight-pulse",
        heroEffectParams: { lightest: 300 },
      })
    ).toEqual({ fontFamily: "Inter", heroEffect: 0 });
    const other = { heroEffectId: "name.shiny" };
    expect(withoutCatalogFonts(other)).toBe(other);
  });
});
