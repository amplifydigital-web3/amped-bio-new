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
