import { describe, expect, it } from "vitest";
import {
  SCENE_TILES,
  filterScenes,
  isShaderTile,
  sceneIndex,
  scenePatch,
  sceneTilesFor,
} from "./sceneLook";

// Theme Engine v2 phase 2, Scene row (board 01).

describe("scene tiles", () => {
  it("offers the v1 overlays first, then the eight Plus scenes, then the shader scenes", () => {
    expect(SCENE_TILES).toHaveLength(37);
    expect(SCENE_TILES.slice(0, 9).map(t => t.id)).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9]);
    expect(SCENE_TILES.slice(9, 17).map(t => t.entry.label)).toEqual([
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
    expect(filterScenes(SCENE_TILES, "all")).toHaveLength(37);
    expect(filterScenes(SCENE_TILES, "light")).toHaveLength(17);
    expect(filterScenes(SCENE_TILES, "particles")).toHaveLength(17);
    const shaders = filterScenes(SCENE_TILES, "shaders");
    expect(shaders).toHaveLength(21);
    expect(shaders[0]!.entry.id).toBe("scene.none");
  });

  it("offers shader tiles only with the showcase flag (TE-3b)", () => {
    expect(sceneTilesFor(false)).toHaveLength(17);
    expect(sceneTilesFor(false).some(isShaderTile)).toBe(false);
    expect(sceneTilesFor(true)).toBe(SCENE_TILES);
  });

  it("writes a shader by id with no overlay, so v1 renderers keep the background", () => {
    const aurora = SCENE_TILES.find(t => t.effectId === "scene.aurora")!;
    expect(isShaderTile(aurora)).toBe(true);
    expect(scenePatch(aurora)).toEqual({
      particlesEffect: 0,
      particlesEffectId: "scene.aurora",
      particlesParams: undefined,
    });
    expect(sceneIndex(0, "scene.aurora")).toBe(SCENE_TILES.indexOf(aurora));
  });
});
