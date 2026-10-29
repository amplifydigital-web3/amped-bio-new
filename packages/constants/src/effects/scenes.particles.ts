import { PARTICLE_PRESETS, type ParticlePreset } from "./particlePresets";
import type { ParamSpec, ParamValues, ThemeColors } from "./types";

/**
 * Particle overlay factories (Theme Engine v2, phase 1c; spec 3.5 and 3.6).
 *
 * Each overlay entry builds its tsParticles v4 options from its params and the
 * creator's colors. At the default params a factory returns the v1 preset in
 * the v4 option shape, so pages saved before v2 keep their look: same counts,
 * sizes, speeds, colors and interactions.
 *
 * Plain data, no tsParticles import. packages/ui loads the engine (slim bundle)
 * on demand and passes these options in.
 */

/** Density and speed scale the preset around 40, the default. */
const PIVOT = 40;

export const PARTICLE_PARAMS = {
  density: { kind: "range", min: 10, max: 100, step: 5, default: PIVOT, label: "Density" },
  speed: { kind: "range", min: 10, max: 100, step: 5, default: PIVOT, label: "Speed" },
  /** original keeps the preset colors; theme reads the creator's colors; custom uses color. */
  palette: {
    kind: "choice",
    options: ["original", "theme", "custom"],
    default: "original",
    label: "Colors",
  },
  color: { kind: "color", default: "#ffffff", label: "Custom color" },
} as const satisfies Record<string, ParamSpec>;

/** The parts of a tsParticles options object the factories read and write. */
interface ColorOptions {
  value?: unknown;
  [key: string]: unknown;
}
interface LooseParticles {
  number?: { value: number; [key: string]: unknown };
  move?: { speed: number; [key: string]: unknown };
  color?: ColorOptions;
  paint?: { color?: ColorOptions; [key: string]: unknown };
  links?: { color?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}
interface LooseOptions {
  particles?: LooseParticles;
  interactivity?: { events?: { resize?: unknown; [key: string]: unknown }; [key: string]: unknown };
  resize?: unknown;
  [key: string]: unknown;
}

const HEX = /^#[0-9a-f]{6}$/i;

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The colors a preset paints with, or null to keep its own. */
function paletteColors(params: ParamValues, colors?: ThemeColors): string[] | null {
  const palette = params["palette"];
  const custom = params["color"];
  if (palette === "custom") {
    return typeof custom === "string" && HEX.test(custom) ? [custom] : null;
  }
  if (palette === "theme" && colors) {
    const list = [colors.text, colors.button, colors.container].filter(
      (value, index, all): value is string =>
        typeof value === "string" && value !== "" && all.indexOf(value) === index
    );
    return list.length > 0 ? list : null;
  }
  return null;
}

/**
 * A v1 preset (tsParticles v3 shape) in the v4 shape. v4 moved the particle
 * fill from particles.color to particles.paint.color; resize moved from
 * interactivity.events to the root. Everything else carries over.
 */
export function toV4Options(preset: ParticlePreset): ParticlePreset {
  const out = JSON.parse(JSON.stringify(preset)) as LooseOptions;
  const particles = out.particles;
  if (particles && "color" in particles) {
    particles.paint = { color: particles.color };
    delete particles.color;
  }
  const events = out.interactivity?.events;
  if (events && "resize" in events) {
    out.resize = events.resize;
    delete events.resize;
  }
  return out;
}

/**
 * The v4 options for a v1 particle preset with the overlay params applied.
 * Unknown ids return an empty object, which renders nothing.
 */
export function particleOptions(
  legacyId: number,
  params: ParamValues = {},
  colors?: ThemeColors
): ParticlePreset {
  const preset = PARTICLE_PRESETS[legacyId];
  if (!preset) return {};
  return presetOptions(preset, params, colors);
}

/**
 * Any preset in the v1 shape with the overlay params applied, in the v4 shape.
 * The v1 overlays and the phase 2 scenes (scenes.presets.ts) share it.
 */
export function presetOptions(
  preset: ParticlePreset,
  params: ParamValues = {},
  colors?: ThemeColors
): ParticlePreset {
  const out = toV4Options(preset) as LooseOptions;
  const particles = out.particles;
  if (!particles) return out;

  const density = num(params["density"], PIVOT);
  if (density !== PIVOT && particles.number) {
    particles.number.value = Math.max(1, Math.round((particles.number.value * density) / PIVOT));
  }

  const speed = num(params["speed"], PIVOT);
  if (speed !== PIVOT && particles.move) {
    particles.move.speed = Number(((particles.move.speed * speed) / PIVOT).toFixed(3));
  }

  const palette = paletteColors(params, colors);
  if (palette) {
    const current = particles.paint?.color ?? {};
    particles.paint = {
      ...particles.paint,
      // A multi color preset (confetti) keeps cycling through the new colors
      color: { ...current, value: Array.isArray(current.value) ? palette : palette[0] },
    };
    if (particles.links) particles.links.color = palette[0];
  }

  return out;
}
