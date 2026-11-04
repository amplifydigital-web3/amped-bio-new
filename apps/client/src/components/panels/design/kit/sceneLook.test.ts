import { describe, expect, it } from "vitest";
import { SCENE_TILES, filterScenes, sceneIndex, scenePatch } from "./sceneLook";

// Theme Engine v2 phase 2, Scene row (board 01).

describe("scene tiles", () => {
  it("offers the v1 overlays first, then the eight Plus scenes", () => {
    expect(SCENE_TILES).toHaveLength(17);
    expect(SCENE_TILES.slice(0, 9).map(t => t.id)).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9]);
    expect(SCENE_TILES.slice(9).map(t => t.entry.label)).toEqual([
      "Fire",
      "Triangles",
      "Big circles",
      "Ambient",
      "Hearts",
      "Leaves",
      "Petals",
      "Emoji rain",
    ]);
  });

  it("writes the id with the nearest v1 overlay and starts from default params", () => {
    const fire = SCENE_TILES.find(t => t.effectId === "scene.fire")!;
    expect(scenePatch(fire)).toEqual({
      particlesEffect: 5,
      particlesEffectId: "scene.fire",
      particlesParams: undefined,
    });
    expect(scenePatch(SCENE_TILES[3]!)).toEqual({
      particlesEffect: 3,
      particlesEffectId: undefined,
      particlesParams: undefined,
    });
  });

  it("selects a stored id over the integer", () => {
    expect(sceneIndex(5, "scene.fire")).toBe(9);
    expect(sceneIndex(5)).toBe(5);
    expect(sceneIndex(6)).toBe(-1);
  });

  it("filters by Show, keeping None", () => {
    expect(filterScenes(SCENE_TILES, "all")).toHaveLength(17);
    expect(filterScenes(SCENE_TILES, "light")).toHaveLength(17);
    expect(filterScenes(SCENE_TILES, "particles")).toHaveLength(17);
    expect(filterScenes(SCENE_TILES, "shaders").map(t => t.entry.id)).toEqual(["scene.none"]);
  });
});
