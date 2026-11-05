import { describe, expect, it } from "vitest";
import { SCENE_TILES, filterScenes, offeredScenes, sceneIndex, scenePatch } from "./sceneLook";

// Theme Engine v2 phase 2, Scene row (board 01).

describe("scene tiles", () => {
  it("offers the v1 overlays first, then the Plus scenes, then Comet trails", () => {
    expect(SCENE_TILES).toHaveLength(23);
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
      "Fountain",
      "Fireworks",
      "Hyperspace",
      "Sea anemone",
      "Squares",
      "Comet trails",
    ]);
  });

  it("keeps Showcase scenes out of the grid while the showcase flag is off", () => {
    expect(offeredScenes(SCENE_TILES, false).map(t => t.effectId)).not.toContain("scene.trail");
    expect(offeredScenes(SCENE_TILES, false)).toHaveLength(22);
    expect(offeredScenes(SCENE_TILES, true)).toHaveLength(23);
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
    expect(filterScenes(SCENE_TILES, "all")).toHaveLength(23);
    // Light only hides Comet trails, the one heavy scene
    expect(filterScenes(SCENE_TILES, "light")).toHaveLength(22);
    expect(filterScenes(SCENE_TILES, "particles")).toHaveLength(23);
    expect(filterScenes(SCENE_TILES, "shaders").map(t => t.entry.id)).toEqual(["scene.none"]);
  });
});
