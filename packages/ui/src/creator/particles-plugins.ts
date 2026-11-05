import type { Engine } from "@tsparticles/engine";
import { loadTrailEffect } from "@tsparticles/effect-trail";
import { loadCanvasMaskPlugin } from "@tsparticles/plugin-canvas-mask";
import { loadEmittersPlugin } from "@tsparticles/plugin-emitters";
import { loadEmittersShapeSquare } from "@tsparticles/plugin-emitters-shape-square";
import { loadDestroyUpdater } from "@tsparticles/updater-destroy";
import { PARTICLE_PLUGINS, type ParticlePlugin } from "@repo/constants";

/**
 * TE-3f: every plugin a registry scene may name (PARTICLE_PLUGINS), in one
 * chunk. particles-runtime.ts registers them on the second engine before its
 * first load, which tsParticles v4 requires.
 */

const LOADERS: Record<ParticlePlugin, (engine: Engine) => Promise<void>> = {
  emitters: engine => loadEmittersPlugin(engine as Parameters<typeof loadEmittersPlugin>[0]),
  "emitters-square": engine => loadEmittersShapeSquare(engine),
  destroy: engine => loadDestroyUpdater(engine),
  trail: engine => loadTrailEffect(engine),
  "canvas-mask": engine => loadCanvasMaskPlugin(engine),
};

export async function registerScenePlugins(engine: Engine): Promise<void> {
  // In order: the square emitter shape registers on the emitters plugin
  for (const id of PARTICLE_PLUGINS) await LOADERS[id](engine);
}
