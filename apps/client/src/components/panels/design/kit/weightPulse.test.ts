import { describe, expect, it } from "vitest";
import type { FontCatalogEntry } from "@repo/constants";
import { canPulse, clampPulseParams, pulseRefit, weightPulsePatch } from "./weightPulse";
import { nameRowTiles, NAME_TILES } from "./nameLook";

// Theme Engine v2 TE-3e2: Weight pulse in the editor

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
const STATIC: FontCatalogEntry = { f: "Bebas Neue", c: "display", w: [400], s: ["latin"] };

describe("Weight pulse in the editor", () => {
  it("shows only with fontCatalog, last", () => {
    expect(nameRowTiles(true)).toBe(NAME_TILES);
    expect(nameRowTiles(false).map(t => t.effectId)).not.toContain("name.weight-pulse");
  });

  it("needs a name face with a weight axis", () => {
    expect(canPulse(VARIABLE)).toBe(true);
    expect(canPulse(STATIC)).toBe(false);
    expect(weightPulsePatch(STATIC)).toBeNull();
    expect(weightPulsePatch(NARROW)).toEqual({
      heroEffect: 0,
      heroEffectId: "name.weight-pulse",
      heroEffectParams: { lightest: 400, boldest: 700 },
    });
  });

  it("keeps the sliders inside the axis", () => {
    expect(clampPulseParams(NARROW, { lightest: 100, boldest: 1000 })).toEqual({
      lightest: 400,
      boldest: 700,
    });
  });

  it("refits or drops the effect when the name face changes", () => {
    const config = {
      heroEffect: 0,
      heroEffectId: "name.weight-pulse",
      heroEffectParams: { lightest: 300, boldest: 900 },
    };
    expect(pulseRefit(config, NARROW)).toEqual({
      heroEffectParams: { lightest: 400, boldest: 700 },
    });
    expect(pulseRefit(config, STATIC)).toEqual({
      heroEffect: 0,
      heroEffectId: undefined,
      heroEffectParams: undefined,
    });
    expect(pulseRefit({ heroEffectId: "name.shiny" }, STATIC)).toEqual({});
  });
});
