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
export {
  GALAXY_FIELD_PARAMS,
  SHADER_GALLERY_PARAMS,
  SHADER_REACTIVE_PARAMS,
  SHADER_SCENES,
  shaderPalette,
} from "./scenes.shaders";
export * from "./surfaces";
export { CURSOR_COLOR_PARAMS, CURSOR_EFFECTS, CURSOR_TRAIL_PARAMS } from "./cursors";
export { nameSettle, isNameEntrance } from "./names";
export {
  NAME_SPEED_FACTOR,
  NAME_SPEED_PARAM,
  ROTATING_WORDS_MAX,
  ROTATING_WORDS_MS,
  rotatingWords,
} from "./names";
export {
  HOVER_SPEED_MS,
  HOVER_SPEED_PARAM,
  HOVER_STRENGTH_PARAM,
  hoverStrengthFactor,
  hoverStrengthVars,
} from "./buttonHovers";
export { PAGE_BUDGET, pageCost, type CostPart, type PageCost } from "./cost";
