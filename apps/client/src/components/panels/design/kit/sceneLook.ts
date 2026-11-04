import { SCENE_PRESETS, getEffect, type EffectEntry, type ThemeConfig } from "@repo/constants";

// Scene row (Theme Engine v2 phase 2, board 01). Decision 4: Scene replaces
// Particles; the row edits the overlay slot. Shader scenes join in phase 3.

export interface SceneTile {
  /** The v1 particlesEffect; for a v2 only scene, the nearest v1 overlay. */
  id: number;
  entry: EffectEntry;
  /** A v2 only scene, stored as particlesEffectId. */
  effectId?: string;
}

/** The overlays the editor offers today, in today's order (6, Matrix, stays retired). */
const V1_SCENES: [number, string][] = [
  [0, "scene.none"],
  [1, "scene.floating-dots"],
  [2, "scene.links"],
  [3, "scene.snow"],
  [4, "scene.bubbles"],
  [5, "scene.fireflies"],
  [7, "scene.confetti"],
  [8, "scene.stars"],
  [9, "scene.geometric"],
];

export const SCENE_TILES: SceneTile[] = [
  ...V1_SCENES.map(([id, effectId]) => ({ id, entry: getEffect("scene", effectId) })),
  ...Object.entries(SCENE_PRESETS).map(([key, scene]) => ({
    id: scene.fallback,
    effectId: `scene.${key}`,
    entry: getEffect("scene", `scene.${key}`),
  })),
];

export const SCENE_FILTERS = ["all", "light", "particles", "shaders"] as const;
export type SceneFilter = (typeof SCENE_FILTERS)[number];
export const SCENE_FILTER_LABELS: Record<SceneFilter, string> = {
  all: "All",
  light: "Light only",
  particles: "Particles",
  shaders: "Shaders",
};

/** Board 01 Show filter. None stays in every view, so a creator can always clear the scene. */
export function filterScenes(tiles: SceneTile[], filter: SceneFilter): SceneTile[] {
  return tiles.filter(({ entry }) => {
    if (entry.id === "scene.none") return true;
    if (filter === "light") return entry.cost !== "heavy";
    if (filter === "particles") return entry.engine === "particles";
    if (filter === "shaders") return entry.engine === "webgl";
    return true;
  });
}

/** The patch a tile writes. A new scene starts from its default params. */
export function scenePatch(tile: SceneTile): Partial<ThemeConfig> {
  return {
    particlesEffect: tile.id,
    particlesEffectId: tile.effectId,
    particlesParams: undefined,
  };
}

/** The selected tile: a stored v2 id first, else the v1 integer. */
export function sceneIndex(particlesEffect: number, storedId?: string): number {
  return SCENE_TILES.findIndex(t =>
    storedId ? t.effectId === storedId : !t.effectId && t.id === particlesEffect
  );
}
