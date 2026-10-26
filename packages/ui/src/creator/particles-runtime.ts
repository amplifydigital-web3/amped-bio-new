import { tsParticles, type Container, type ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";

/**
 * The particle engine chunk (spec 3.6, effects-particles). ParticlesLayer
 * imports this module on demand, after first paint and only when a page has a
 * particle overlay, so pages without particles never download the engine.
 * tsParticles v4 with the slim bundle: every core overlay's shapes, links and
 * hover modes, without the full bundle the v1 layer loads.
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

/** Starts an overlay inside the element. The caller destroys the container. */
export async function mountParticles(
  element: HTMLElement,
  options: Record<string, unknown>
): Promise<Container | undefined> {
  await ensureSlim();
  return tsParticles.load({ element, options: options as ISourceOptions });
}
