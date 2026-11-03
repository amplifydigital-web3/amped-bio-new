/**
 * Theme Engine v2 effect registry (Build Board #28, phase 1a). Nothing renders
 * from it yet: the shared renderer in phase 1b is its first consumer.
 */

export * from "./types";
export * from "./registry";
export * from "./legacy";
export { PARTICLE_PRESETS, type ParticlePreset } from "./particlePresets";
export { PARTICLE_PARAMS, particleOptions, presetOptions, toV4Options } from "./scenes.particles";
export { EMOJI_SET_PARAM, SCENE_PRESETS, emojiGlyphs, type ScenePreset } from "./scenes.presets";
export * from "./scenes.gradients";
export * from "./surfaces";
export { nameSettle, isNameEntrance } from "./names";
export { NAME_SPEED_FACTOR, NAME_SPEED_PARAM } from "./names";
export { HOVER_SPEED_MS, HOVER_SPEED_PARAM } from "./buttonHovers";
export { PAGE_BUDGET, pageCost, type CostPart, type PageCost } from "./cost";
export {
  COMET_PARAMS,
  EMITTER_SCENES,
  PARTICLE_PLUGINS,
  PARTICLE_TEXT_PARAMS,
  STILL_COUNT_KEY,
  TRAIL_LENGTH_PARAM,
  cometTrailOptions,
  emitterSceneOptions,
  particleTextOptions,
  textDotCount,
  type EmitterScene,
  type ParticlePlugin,
} from "./scenes.emitters";
export {
  COMET_TRAILS_EFFECT,
  EMITTER_SCENE_EFFECTS,
  PARTICLE_TEXT_EFFECT,
  PLUGIN_SCENE_IDS,
} from "./scenes.plugins";
