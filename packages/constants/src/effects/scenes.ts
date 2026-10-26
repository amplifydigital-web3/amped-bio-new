import { PARTICLE_PRESETS } from "./particlePresets";
import type { EffectEntry } from "./types";

/**
 * Scene layer (decision 4: Scene replaces Background plus Particles). The base
 * slot (color, gradient, image, video) is plain data in the theme config; the
 * registry holds the effect ids: the particle overlays now, shader scenes in
 * phase 3. The v1 particlesEffect presets return their options unchanged.
 * Phase 1c makes them color aware factories on tsParticles v4 slim and sets
 * colorMode to theme. 6 (Matrix) is not offered in the editor today; it stays
 * retired so creators who picked it keep their page.
 */

const overlay = (
  id: string,
  label: string,
  description: string,
  legacyId: number,
  extra: Partial<EffectEntry> = {}
): EffectEntry => ({
  id: `scene.${id}`,
  layer: "scene",
  label,
  description,
  tier: "core",
  engine: "particles",
  cost: "light",
  source: "tsparticles",
  colorMode: "fixed",
  params: {},
  loop: true,
  render: { kind: "particles", options: () => PARTICLE_PRESETS[legacyId] ?? {}, plugins: [] },
  preview: { sample: "scene" },
  legacyId,
  addedIn: 1,
  ...extra,
});

export const SCENE_EFFECTS: readonly EffectEntry[] = [
  {
    id: "scene.none",
    layer: "scene",
    label: "None",
    description: "No moving scene",
    tier: "core",
    engine: "css",
    cost: "still",
    source: "amped",
    colorMode: "theme",
    params: {},
    render: { kind: "none" },
    preview: { sample: "scene" },
    legacyId: 0,
    addedIn: 1,
  },
  overlay("floating-dots", "Floating dots", "Gentle floating particles", 1),
  overlay("links", "Connecting lines", "Lines that follow the pointer", 2),
  overlay("snow", "Snow", "Falling snow", 3),
  overlay("bubbles", "Bubbles", "Rising bubbles", 4),
  overlay("fireflies", "Fireflies", "Glowing fireflies", 5),
  overlay("matrix", "Matrix", "Falling green digits", 6, { retired: true }),
  overlay("confetti", "Confetti", "Colorful confetti", 7),
  overlay("stars", "Stars", "Twinkling stars", 8),
  overlay("geometric", "Geometric", "Connected geometric shapes", 9),
];
