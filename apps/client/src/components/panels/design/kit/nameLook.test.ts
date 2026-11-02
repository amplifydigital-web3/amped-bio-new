import { describe, expect, it } from "vitest";
import { getEffect } from "@repo/constants";
import { NAME_TILES, nameIndex, namePaintedColors, namePatch, nameRowValue } from "./nameLook";

// Theme Engine v2 phase 2, Name row (board 08).

describe("name tiles", () => {
  it("offers the six v1 effects first, then nine core effects", () => {
    expect(NAME_TILES).toHaveLength(15);
    expect(NAME_TILES.slice(0, 6).map(t => t.id)).toEqual([0, 2, 6, 7, 8, 9]);
    expect(NAME_TILES.slice(0, 6).every(t => !t.effectId)).toBe(true);
    expect(NAME_TILES.slice(6).map(t => t.entry.label)).toEqual([
      "Shiny",
      "Gradient",
      "Outline",
      "Chrome",
      "Shadow stack",
      "Blur in",
      "Split reveal",
      "Typewriter",
      "Decrypt",
    ]);
  });

  it("writes the id and keeps the nearest v1 look for renderers without the flag", () => {
    const shiny = NAME_TILES.find(t => t.effectId === "name.shiny")!;
    expect(namePatch(shiny)).toEqual({
      heroEffect: 2,
      heroEffectId: "name.shiny",
      heroEffectParams: undefined,
    });
    expect(namePatch(NAME_TILES[2]!)).toEqual({
      heroEffect: 6,
      heroEffectId: undefined,
      heroEffectParams: undefined,
    });
  });

  it("selects a stored id over the integer", () => {
    expect(nameIndex(2, "name.shiny")).toBe(6);
    expect(nameIndex(2)).toBe(1);
    expect(nameIndex(4)).toBe(-1);
  });
});

describe("name row line and guard", () => {
  it("says how the effect plays", () => {
    expect(nameRowValue(getEffect("name", "name.glow"))).toBe("Glow");
    expect(nameRowValue(getEffect("name", "name.shiny"))).toBe("Shiny, plays once");
    expect(nameRowValue(getEffect("name", "name.shiny"), "always")).toBe("Shiny, loops");
    expect(nameRowValue(getEffect("name", "name.wave"))).toBe("Wave, loops");
    expect(nameRowValue(getEffect("name", "name.decrypt"))).toBe("Decrypt, plays once");
  });

  it("measures the colors an effect paints", () => {
    const values = { buttonColor: "#111111", fontColor: "#eeeeee" };
    expect(namePaintedColors(getEffect("name", "name.neon"), values)).toEqual(["#FF00FF"]);
    expect(namePaintedColors(getEffect("name", "name.chrome"), values)).toHaveLength(2);
    expect(namePaintedColors(getEffect("name", "name.gradient-sweep"), values)).toEqual([
      "#111111",
      "#eeeeee",
    ]);
    expect(namePaintedColors(getEffect("name", "name.shiny"), values)).toEqual([]);
  });
});
