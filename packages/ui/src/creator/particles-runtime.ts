import { tsParticles, type Container, type Engine, type ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

/**
 * The particle engine chunk (spec 3.6, effects-particles). ParticlesLayer
 * imports this module on demand, after first paint and only when a page has a
 * particle overlay, so pages without particles never download the engine.
 * tsParticles v4 with the slim bundle: every core overlay's shapes, links and
 * hover modes, without the full bundle the v1 layer loads.
 *
 * TE-3f: tsParticles v4 takes plugins only before an engine's first load, and
 * the editor mounts slim scenes (tiles, the preview) before a creator picks
 * Fireworks. So a scene that names plugins on its registry entry runs on a
 * second engine that registers slim plus every scene plugin at once
 * (particles-plugins.ts, its own chunk, about 15 KB gzip). Pages with only
 * slim scenes never download it.
 */

let slimReady: Promise<void> | null = null;

function ensureSlim(): Promise<void> {
  if (!slimReady) {
    slimReady = loadSlim(tsParticles).catch(error => {
      slimReady = null; // try again on the next mount
      throw error;
    });
  }
  return slimReady;
}

let pluginEngine: Promise<Engine> | null = null;

/** The second engine, created once, with slim and the scene plugins registered. */
function ensurePluginEngine(): Promise<Engine> {
  if (!pluginEngine) {
    pluginEngine = import("./particles-plugins")
      .then(async ({ registerScenePlugins }) => {
        // The engine class is not exported; the shared instance's constructor is it
        const EngineClass = tsParticles.constructor as new () => Engine;
        const engine = new EngineClass();
        await loadSlim(engine);
        await registerScenePlugins(engine);
        return engine;
      })
      .catch(error => {
        pluginEngine = null;
        throw error;
      });
  }
  return pluginEngine;
}

let mounts = 0;

/**
 * Starts an overlay inside the element. The caller destroys the container.
 * Each mount takes its own id: without one, tsParticles reuses its default id
 * and a second layer (the editor's scene tiles, the preview) replaces the first.
 */
export async function mountParticles(
  element: HTMLElement,
  options: Record<string, unknown>,
  plugins: readonly string[] = []
): Promise<Container | undefined> {
  let engine: Engine = tsParticles;
  if (plugins.length > 0) engine = await ensurePluginEngine();
  else await ensureSlim();
  mounts += 1;
  return engine.load({
    id: `amped-particles-${mounts}`,
    element,
    options: options as ISourceOptions,
  });
}
