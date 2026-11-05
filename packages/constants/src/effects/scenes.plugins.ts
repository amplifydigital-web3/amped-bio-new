import {
  COMET_PARAMS,
  EMITTER_SCENES,
  PARTICLE_TEXT_PARAMS,
  cometTrailOptions,
  emitterSceneOptions,
  particleTextOptions,
} from "./scenes.emitters";
import { PARTICLE_PARAMS } from "./scenes.particles";
import type { EffectEntry } from "./types";

/**
 * TE-3f registry entries (spec 3.5). Fountain, Fireworks, Hyperspace, Sea
 * anemone and Squares are Plus and Light, like the other official scenes;
 * they are new in v2 and stored by id. Comet trails and Particle text are
 * Showcase and Heavy: they draw every frame and run only with the showcase
 * flag on (the renderer shows the still version when it is off).
 */

export const EMITTER_SCENE_EFFECTS: readonly EffectEntry[] = Object.entries(EMITTER_SCENES).map(
  ([key, scene]): EffectEntry => ({
    id: `scene.${key}`,
    layer: "scene",
    label: scene.label,
    description: scene.description,
    tier: "plus",
    engine: "particles",
    cost: "light",
    source: "amped",
    colorMode: "theme",
    params: PARTICLE_PARAMS,
    loop: true,
    render: {
      kind: "particles",
      options: (params, colors) => emitterSceneOptions(scene, params, colors),
      plugins: scene.plugins,
    },
    preview: { sample: "scene" },
    addedIn: 2,
  })
);

export const COMET_TRAILS_EFFECT: EffectEntry = {
  id: "scene.trail",
  layer: "scene",
  label: "Comet trails",
  description: "Points of light drift with a tail behind them",
  tier: "showcase",
  engine: "particles",
  cost: "heavy",
  source: "amped",
  colorMode: "theme",
  params: COMET_PARAMS,
  loop: true,
  render: {
    kind: "particles",
    options: (params, colors) => cometTrailOptions(params, colors),
    plugins: ["trail"],
  },
  preview: { sample: "scene", video: true },
  addedIn: 2,
};

export const PARTICLE_TEXT_EFFECT: EffectEntry = {
  id: "name.particle-text",
  layer: "name",
  label: "Particle text",
  description: "Your name drawn in glowing dots",
  tier: "showcase",
  engine: "particles",
  cost: "heavy",
  source: "amped",
  colorMode: "theme",
  params: PARTICLE_TEXT_PARAMS,
  // Twinkles while shown, but has no cycle to settle: Pause motion holds it
  // (hasLoopingMotion in packages/ui reads the particles render)
  render: {
    kind: "particles",
    options: (params, colors) => particleTextOptions(params, colors),
    plugins: ["canvas-mask"],
  },
  preview: { sample: "name", video: true },
  addedIn: 2,
};

/** The scene ids that need a plugin, in board 01 order. */
export const PLUGIN_SCENE_IDS: readonly string[] = [
  ...EMITTER_SCENE_EFFECTS.map(entry => entry.id),
  COMET_TRAILS_EFFECT.id,
];
