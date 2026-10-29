import { describe, expect, it } from "vitest";
import {
  currentPress,
  hoverIndex,
  hoverPatch,
  hoverTiles,
  pressPatch,
  V1_HOVERS,
} from "./motionLook";

// Theme Engine v2 phase 2, Button hover and press rows (board 09).

describe("hover tiles", () => {
  it("offers the ten v1 hovers with the flag off and five more with it on", () => {
    expect(hoverTiles(false)).toBe(V1_HOVERS);
    const tiles = hoverTiles(true);
    expect(tiles).toHaveLength(15);
    expect(tiles.slice(10).map(t => t.name)).toEqual([
      "Fill sweep",
      "Underline grow",
      "Border draw",
      "Icon slide",
      "Arrow nudge",
    ]);
  });

  it("writes a v2 hover by id with the nearest v1 look, and clears it for a v1 tile", () => {
    const tiles = hoverTiles(true);
    expect(hoverPatch(tiles[10]!)).toEqual({
      buttonEffect: 9,
      buttonEffectId: "buttonHover.fill-sweep",
      buttonEffectParams: undefined,
    });
    expect(hoverPatch(tiles[2]!)).toEqual({
      buttonEffect: 2,
      buttonEffectId: undefined,
      buttonEffectParams: undefined,
    });
  });

  it("selects the stored v2 hover first, else the v1 integer", () => {
    const tiles = hoverTiles(true);
    expect(hoverIndex(tiles, 9, "buttonHover.fill-sweep")).toBe(10);
    expect(hoverIndex(tiles, 9)).toBe(9);
    expect(hoverIndex(tiles, 3, "buttonHover.arrow-nudge")).toBe(14);
  });
});

describe("press", () => {
  it("reads unknown ids as none and clears the field for None", () => {
    expect(currentPress(undefined)).toBe("buttonPress.none");
    expect(currentPress("buttonPress.spin")).toBe("buttonPress.none");
    expect(currentPress("buttonPress.ripple")).toBe("buttonPress.ripple");
    expect(pressPatch("buttonPress.none")).toEqual({ buttonPressId: undefined });
    expect(pressPatch("buttonPress.dip")).toEqual({ buttonPressId: "buttonPress.dip" });
  });
});
