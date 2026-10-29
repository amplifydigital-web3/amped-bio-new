/**
 * Theme Engine v2 effect registry (Build Board #28, phase 1a). Nothing renders
 * from it yet: the shared renderer in phase 1b is its first consumer.
 */

export * from "./types";
export * from "./registry";
export * from "./legacy";
export { PARTICLE_PRESETS, type ParticlePreset } from "./particlePresets";
export { PARTICLE_PARAMS, particleOptions, toV4Options } from "./scenes.particles";
