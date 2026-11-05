import { describe, expect, it } from "vitest";
import { CURSOR_TILES, cursorIndex, cursorPatch } from "./cursorLook";
import { PRESS_IDS, pressIdsFor } from "./motionLook";
import { NAME_TILES, nameTilesFor } from "./nameLook";

// Theme Engine v2 phase 3c (spec 3.5): the Cursor row and the flagged tiles.

describe("cursor tiles", () => {
  it("offers None and the seven cursor effects", () => {
    expect(CURSOR_TILES.map(e => e.label)).toEqual([
      "None",
      "Glow",
      "Ring",
      "Spark trail",
      "Pixel trail",
      "Dot trail",
      "Blob",
      "Splash",
    ]);
  });

  it("selects the stored id and falls back to None", () => {
    expect(cursorIndex("cursor.blob")).toBe(6);
    expect(cursorIndex(undefined)).toBe(0);
    expect(cursorIndex("cursor.gone")).toBe(0);
  });

  it("writes the id with default params, and None clears it", () => {
    expect(cursorPatch(CURSOR_TILES[1]!)).toEqual({
      cursorEffectId: "cursor.glow",
      cursorParams: undefined,
    });
    expect(cursorPatch(CURSOR_TILES[0]!)).toEqual({
      cursorEffectId: undefined,
      cursorParams: undefined,
    });
  });
});

describe("showcase tiles", () => {
  it("offers Click spark only with the showcase flag", () => {
    expect(pressIdsFor(true)).toBe(PRESS_IDS);
    expect(pressIdsFor(false)).not.toContain("buttonPress.click-spark");
  });

  it("offers Fuzzy text only with the showcase flag, last, so indexes hold", () => {
    expect(nameTilesFor(true)).toBe(NAME_TILES);
    expect(nameTilesFor(false)).toHaveLength(NAME_TILES.length - 1);
    expect(NAME_TILES.at(-1)!.effectId).toBe("name.fuzzy");
  });
});
