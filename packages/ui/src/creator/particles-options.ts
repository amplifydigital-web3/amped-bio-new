import type { ParticlePreset } from "@repo/constants";

/**
 * The page rules every particle overlay runs under (Screen Review 029 I03,
 * 041 I01 to I04), applied on top of the entry's own options. Same rules as
 * the public page's v1 layer; the editor preview now runs them too, so it
 * plays at 60 fps like the page (spec 3.13, phase 1c).
 *
 * - Pause motion or reduced motion: particles hold still, no pointer effects.
 * - Taps never spawn or remove particles; hover reacts only on fine pointers.
 * - Pointer position is read from the window, so the canvas never takes taps.
 * - 60 fps cap, retina aware, paused while the tab is hidden or off screen.
 */
export function particleLayerOptions(
  base: ParticlePreset,
  { still, finePointer }: { still: boolean; finePointer: boolean }
): Record<string, unknown> {
  const config = base as Record<string, any>;
  const particles = config.particles ?? {};
  const interactivity = config.interactivity ?? {};
  const events = interactivity.events ?? {};
  return {
    ...config,
    particles: {
      ...particles,
      move: { ...particles.move, enable: still ? false : particles.move?.enable },
    },
    interactivity: {
      ...interactivity,
      detectsOn: "window",
      events: {
        ...events,
        onClick: { enable: false },
        onHover: !still && finePointer && events.onHover ? events.onHover : { enable: false },
      },
    },
    fullScreen: { enable: false, zIndex: 0 },
    fpsLimit: 60,
    detectRetina: true,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
  };
}
