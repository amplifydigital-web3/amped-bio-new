import { describe, expect, it } from "vitest";
import { costLine, sceneGuard } from "./PreviewChrome";

// Theme Engine v2 phase 2, Editor chrome: the cost chip line and the scene guard.

const DARK = [{ r: 16, g: 24, b: 32 }];
const MID = [{ r: 120, g: 120, b: 120 }];

describe("cost chip", () => {
  it("reads Still, Light or Heavy with the count", () => {
    expect(costLine("still", 0)).toBe("Still. Nothing on your page moves.");
    expect(costLine("light", 1)).toBe("Light, 1 effect.");
    expect(costLine("heavy", 4)).toBe(
      "Heavy, 4 effects. Weak phones see the still version. Everything else stays."
    );
  });
});

describe("scene guard", () => {
  const base = { surface: false, moving: true, over: "Fire" };

  it("passes readable text and stays quiet with a surface or a still scene", () => {
    expect(sceneGuard({ ...base, fontColor: "#ffffff", backgrounds: DARK })).toBeNull();
    expect(
      sceneGuard({ ...base, surface: true, fontColor: "#777777", backgrounds: MID })
    ).toBeNull();
    expect(
      sceneGuard({ ...base, moving: false, fontColor: "#777777", backgrounds: MID })
    ).toBeNull();
    expect(sceneGuard({ ...base, fontColor: "#777777", backgrounds: null })).toBeNull();
  });

  it("flags the name under 3:1 and the bio under 4.5:1", () => {
    expect(sceneGuard({ ...base, fontColor: "#808080", backgrounds: MID })).toMatchObject({
      part: "name",
      needs: 3,
      over: "Fire",
    });
    const bio = sceneGuard({
      ...base,
      fontColor: "#000000",
      backgrounds: [{ r: 90, g: 90, b: 90 }],
    });
    expect(bio).toMatchObject({ part: "bio", needs: 4.5 });
    expect(bio!.ratio).toBeGreaterThanOrEqual(3);
  });
});
