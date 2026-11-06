import { describe, expect, it } from "vitest";
import { getEffect } from "@repo/constants";
import { hoverParamEntry, hoverTiles, pressIdsFor } from "./motionLook";

// Theme Engine v2 phase 3e: the Plus hovers, Jelly press and Strength show
// only with themeShowcase

describe("Plus motion tiles", () => {
  it("adds Magnet, Lift and tilt and Jelly last, each on a v1 look for renderers without the flag", () => {
    expect(hoverTiles(true, false)).toHaveLength(15);
    const tiles = hoverTiles(true, true);
    expect(tiles).toHaveLength(18);
    expect(tiles.slice(-3)).toEqual([
      { id: 1, name: "Magnet", effectId: "buttonHover.magnet" },
      { id: 1, name: "Lift and tilt", effectId: "buttonHover.lift-tilt" },
      { id: 8, name: "Jelly", effectId: "buttonHover.jelly" },
    ]);
  });

  it("offers Click spark and Jelly press only with the flag", () => {
    expect(pressIdsFor(false)).toEqual([
      "buttonPress.none",
      "buttonPress.ripple",
      "buttonPress.dip",
    ]);
    expect(pressIdsFor(true).slice(-2)).toEqual([
      "buttonPress.click-spark",
      "buttonPress.jelly-press",
    ]);
  });

  it("shows Strength only with the flag", () => {
    const scale = getEffect("buttonHover", "buttonHover.scale");
    expect(Object.keys(hoverParamEntry(scale, true).params)).toEqual(["speed", "strength"]);
    expect(Object.keys(hoverParamEntry(scale, false).params)).toEqual(["speed"]);
    const sweep = getEffect("buttonHover", "buttonHover.fill-sweep");
    expect(hoverParamEntry(sweep, false)).toBe(sweep);
  });
});
