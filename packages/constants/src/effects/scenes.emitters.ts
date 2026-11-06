import type { ParticlePreset } from "./particlePresets";
import { PARTICLE_PARAMS } from "./scenes.particles";
import type { ParamSpec, ParamValues, ThemeColors } from "./types";

/**
 * Theme Engine v2 phase 3, TE-3f (spec 3.5, board 01): the scenes that need a
 * tsParticles plugin beyond the slim bundle. Fountain, Fireworks, Hyperspace,
 * Sea anemone and Squares spawn their particles from emitters; Comet trails
 * draws each particle with its tail. Amped's own options, written in the v4
 * shape (paint, not color), so no translation step.
 *
 * Plugins are named by id on the entry (render.plugins). packages/ui maps each
 * id to its loader and imports it on demand, so a page loads only the plugins
 * its scene uses.
 *
 * Emitter scenes start empty and fill over a second. A still page (Pause
 * motion, reduced motion, a weak device) never runs the emitters, so each
 * scene also carries a still count: the renderer drops the emitters and
 * scatters that many particles, held where they land.
 */

export const PARTICLE_PLUGINS = [
  "emitters",
  "emitters-square",
  "destroy",
  "trail",
  "canvas-mask",
] as const;
export type ParticlePlugin = (typeof PARTICLE_PLUGINS)[number];

/** Root key the renderer reads for a still frame and strips before load. */
export const STILL_COUNT_KEY = "ampedStill";

export interface EmitterScene {
  label: string;
  description: string;
  /** The v1 overlay a renderer without the flag draws instead. */
  fallback: number;
  plugins: readonly ParticlePlugin[];
  /** Particles a still frame scatters in place of the emitters. */
  still: number;
  preset: ParticlePreset;
}

const PIVOT = 40;

/**
 * The most particles an emitter scene keeps alive at once. Emitters spawn
 * until particles leave the frame, so slow speeds and high density on a tall
 * phone could otherwise pile up thousands; past the cap new spawns wait.
 */
export const EMITTER_PARTICLE_LIMIT = 300;
const EMITTER_LIMIT = { mode: "wait", value: EMITTER_PARTICLE_LIMIT } as const;

export const EMITTER_SCENES: Readonly<Record<string, EmitterScene>> = {
  fountain: {
    label: "Fountain",
    description: "Drops arc up from the bottom and fall back",
    fallback: 4,
    plugins: ["emitters"],
    still: 60,
    preset: {
      particles: {
        number: { value: 0, limit: EMITTER_LIMIT },
        paint: { color: { value: ["#5bc0eb", "#9bc53d", "#fde74c", "#ffffff"] } },
        shape: { type: "circle" },
        opacity: { value: 0.8 },
        size: { value: { min: 2, max: 4 } },
        move: {
          enable: true,
          speed: { min: 8, max: 14 },
          direction: "top",
          gravity: { enable: true, acceleration: 9.81 },
          outModes: { default: "destroy", top: "none" },
        },
      },
      emitters: {
        position: { x: 50, y: 100 },
        direction: "top",
        rate: { quantity: 3, delay: 0.1 },
        size: { width: 8, height: 0, mode: "percent" },
        life: { wait: false },
        draw: false,
      },
    },
  },
  fireworks: {
    label: "Fireworks",
    description: "Rockets rise and burst into sparks",
    fallback: 7,
    plugins: ["emitters", "destroy"],
    still: 80,
    preset: {
      particles: {
        number: { value: 0, limit: EMITTER_LIMIT },
        paint: { color: { value: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"] } },
        shape: { type: "circle" },
        opacity: { value: 1 },
        size: { value: 3 },
        destroy: {
          // Rockets burst when they reach the top third of the scene
          bounds: { top: 30 },
          mode: "split",
          split: {
            count: 1,
            factor: { value: 0.33 },
            rate: { value: 40 },
            particles: {
              number: { value: 0 },
              opacity: {
                value: { min: 0.1, max: 1 },
                animation: {
                  enable: true,
                  speed: 0.8,
                  sync: false,
                  startValue: "max",
                  destroy: "min",
                },
              },
              size: { value: { min: 1, max: 2 } },
              life: { count: 1, duration: { value: { min: 1, max: 2 } } },
              move: {
                enable: true,
                speed: { min: 4, max: 10 },
                direction: "outside",
                decay: 0.05,
                gravity: { enable: true, acceleration: 4 },
                outModes: { default: "destroy" },
              },
            },
          },
        },
        move: {
          enable: true,
          speed: { min: 12, max: 18 },
          direction: "top",
          straight: true,
          outModes: { default: "destroy", top: "none" },
        },
      },
      emitters: {
        position: { x: 50, y: 100 },
        direction: "top",
        rate: { quantity: 1, delay: 0.6 },
        size: { width: 80, height: 0, mode: "percent" },
        life: { wait: false },
        draw: false,
      },
    },
  },
  hyperspace: {
    label: "Hyperspace",
    description: "Stars stream out from the center",
    fallback: 8,
    plugins: ["emitters"],
    still: 90,
    preset: {
      particles: {
        number: { value: 0, limit: EMITTER_LIMIT },
        paint: { color: { value: "#ffffff" } },
        shape: { type: "circle" },
        opacity: {
          value: { min: 0.3, max: 1 },
          animation: { enable: true, speed: 1, sync: false, startValue: "min" },
        },
        size: {
          value: { min: 0.5, max: 2.5 },
          animation: { enable: true, speed: 2, sync: false, startValue: "min", count: 1 },
        },
        move: {
          enable: true,
          speed: { min: 2, max: 9 },
          direction: "outside",
          straight: true,
          outModes: { default: "destroy" },
        },
      },
      emitters: {
        position: { x: 50, y: 50 },
        rate: { quantity: 3, delay: 0.05 },
        size: { width: 2, height: 2, mode: "percent" },
        life: { wait: false },
        draw: false,
      },
    },
  },
  "sea-anemone": {
    label: "Sea anemone",
    description: "Soft tendrils curl out from the center",
    fallback: 5,
    plugins: ["emitters", "trail"],
    still: 70,
    preset: {
      particles: {
        number: { value: 0, limit: EMITTER_LIMIT },
        paint: { color: { value: ["#ff6f91", "#ffc75f", "#f9f871", "#c34a36"] } },
        shape: { type: "circle" },
        opacity: {
          value: { min: 0.4, max: 0.9 },
          animation: { enable: true, speed: 0.3, sync: false, startValue: "max", destroy: "min" },
        },
        size: { value: { min: 1.5, max: 3 } },
        // Each dot draws a short tail, so the spirals read as tendrils
        effect: {
          type: "trail",
          options: { trail: { length: 12, minWidth: 0.5, fade: true } },
        },
        move: {
          enable: true,
          speed: { min: 1, max: 2 },
          spin: { enable: true, acceleration: { min: 0.8, max: 2.2 } },
          outModes: { default: "destroy" },
        },
      },
      emitters: {
        position: { x: 50, y: 50 },
        rate: { quantity: 2, delay: 0.12 },
        size: { width: 0, height: 0 },
        life: { wait: false },
        draw: false,
      },
    },
  },
  squares: {
    label: "Squares",
    description: "Outlined squares grow out of a frame and fade",
    fallback: 9,
    plugins: ["emitters", "emitters-square"],
    still: 30,
    preset: {
      particles: {
        number: { value: 0, limit: EMITTER_LIMIT },
        paint: {
          color: { value: "#ffffff" },
          fill: { enable: false },
          stroke: { width: 1, opacity: 1 },
        },
        shape: { type: "square" },
        opacity: {
          value: { min: 0.1, max: 0.8 },
          animation: { enable: true, speed: 0.4, sync: false, startValue: "max", destroy: "min" },
        },
        size: {
          value: { min: 4, max: 34 },
          animation: { enable: true, speed: 6, sync: false, startValue: "min", destroy: "max" },
        },
        rotate: {
          value: { min: 0, max: 90 },
          direction: "random",
          animation: { enable: true, speed: 2 },
        },
        move: {
          enable: true,
          speed: { min: 0.2, max: 0.8 },
          direction: "none",
          outModes: { default: "destroy" },
        },
      },
      emitters: {
        position: { x: 50, y: 50 },
        shape: { type: "square", options: {} },
        rate: { quantity: 1, delay: 0.25 },
        size: { width: 55, height: 55, mode: "percent" },
        life: { wait: false },
        draw: false,
      },
    },
  },
};

/** Comet trails: the trail length param, 10 to 100 (spec 3.5). */
export const TRAIL_LENGTH_PARAM = {
  kind: "range",
  min: 10,
  max: 100,
  step: 5,
  default: 40,
  label: "Length",
} as const satisfies ParamSpec;

/** The Comet trails preset: points drift with a fading tail behind each. */
export const COMET_TRAILS: ParticlePreset = {
  particles: {
    // No density scaling: a phone frame keeps enough comets to read as a scene
    number: { value: 40 },
    paint: { color: { value: ["#ffffff", "#9ad1ff", "#ffd6a5"] } },
    shape: { type: "circle" },
    opacity: { value: 1 },
    size: { value: { min: 1, max: 3 } },
    effect: {
      type: "trail",
      options: { trail: { length: 20, minWidth: 1, fade: true } },
    },
    move: {
      enable: true,
      speed: { min: 2, max: 5 },
      direction: "none",
      random: false,
      straight: false,
      outModes: { default: "out" },
    },
  },
};

/** Particle text: dots that form the creator's name and twinkle. */
export const PARTICLE_TEXT: ParticlePreset = {
  particles: {
    // The mask places at most this many dots (textDotCount)
    number: { value: 400 },
    paint: { color: { value: "#ffffff" } },
    shape: { type: "circle" },
    opacity: {
      value: { min: 0.5, max: 1 },
      animation: { enable: true, speed: 1.2, sync: false },
    },
    size: { value: { min: 0.8, max: 1.6 } },
    move: { enable: false },
  },
  interactivity: {
    events: { onHover: { enable: true, mode: "bubble" } },
    modes: { bubble: { distance: 34, size: 3, duration: 0.4, opacity: 1 } },
  },
  canvasMask: {
    enable: true,
    scale: 1,
    // The default filter keeps every pixel the text drew (alpha above 0).
    // offset steps through RGBA bytes: 4 reads every pixel, and any other
    // value skews the letters, so density sets the dot count instead
    pixels: { offset: 4 },
    override: { color: false, opacity: false },
    position: { x: 50, y: 50 },
    text: {
      fill: true,
      color: "#000000",
      font: { family: "sans-serif", size: 26, style: "", variant: "", weight: "700" },
      lines: { separator: "\n", spacing: 4 },
      text: "",
    },
  },
};

/**
 * Dots 10 to 100 sets how many dots spell the name: 150 at 10, 900 at 100,
 * 400 at the default. The mask picks that many of the letters' pixels at
 * random, so fewer dots read as a sparser name, never a smaller one.
 */
export function textDotCount(density: number): number {
  const d = Math.max(10, Math.min(100, density));
  return Math.round(150 + ((d - 10) / 90) * 750);
}

type Loose = Record<string, any>;

function scaled(value: unknown, factor: number): unknown {
  if (typeof value === "number") return Number((value * factor).toFixed(3));
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    const range = value as { min: number; max: number };
    return {
      min: Number((range.min * factor).toFixed(3)),
      max: Number((range.max * factor).toFixed(3)),
    };
  }
  return value;
}

/** The colors a scene paints with, or null to keep its own (as scenes.particles.ts). */
function palette(params: ParamValues, colors?: ThemeColors): string[] | null {
  const mode = params["palette"];
  const custom = params["color"];
  if (mode === "custom") {
    return typeof custom === "string" && /^#[0-9a-f]{6}$/i.test(custom) ? [custom] : null;
  }
  if (mode === "theme" && colors) {
    const list = [colors.text, colors.button, colors.container].filter(
      (value, index, all) => value !== "" && all.indexOf(value) === index
    );
    return list.length > 0 ? list : null;
  }
  return null;
}

function paint(particles: Loose, colors: string[] | null): void {
  if (!colors) return;
  const current = particles["paint"]?.color ?? {};
  particles["paint"] = {
    ...particles["paint"],
    color: { ...current, value: Array.isArray(current.value) ? colors : colors[0] },
  };
}

/**
 * An emitter scene with its params applied. Density scales how many particles
 * each burst spawns (and the still count); Speed scales every move speed,
 * the split sparks included; Colors repaints the particles.
 */
export function emitterSceneOptions(
  scene: EmitterScene,
  params: ParamValues = {},
  colors?: ThemeColors
): ParticlePreset {
  const out = JSON.parse(JSON.stringify(scene.preset)) as Loose;
  const density = typeof params["density"] === "number" ? params["density"] : PIVOT;
  const speed = typeof params["speed"] === "number" ? params["speed"] : PIVOT;
  const particles = out["particles"] as Loose;
  const emitters = out["emitters"] as Loose;

  if (density !== PIVOT) {
    const rate = emitters["rate"] as Loose;
    rate["quantity"] = Math.max(1, Math.round((rate["quantity"] * density) / PIVOT));
  }
  out[STILL_COUNT_KEY] = Math.max(1, Math.round((scene.still * density) / PIVOT));

  if (speed !== PIVOT) {
    const factor = speed / PIVOT;
    particles["move"].speed = scaled(particles["move"].speed, factor);
    const split = particles["destroy"]?.split?.particles;
    if (split?.move) split.move.speed = scaled(split.move.speed, factor);
  }

  const swatch = palette(params, colors);
  paint(particles, swatch);
  const sparks = particles["destroy"]?.split?.particles;
  // Sparks carry no color of their own: they take the whole swatch
  if (sparks && swatch) sparks["paint"] = { ...sparks["paint"], color: { value: swatch } };
  return out;
}

/** Comet trails with density, length and colors applied. */
export function cometTrailOptions(params: ParamValues = {}, colors?: ThemeColors): ParticlePreset {
  const out = JSON.parse(JSON.stringify(COMET_TRAILS)) as Loose;
  const particles = out["particles"] as Loose;
  const density = typeof params["density"] === "number" ? params["density"] : PIVOT;
  const length =
    typeof params["length"] === "number" ? params["length"] : TRAIL_LENGTH_PARAM.default;
  particles["number"].value = Math.max(1, Math.round((40 * density) / PIVOT));
  // Length 10 to 100 is the tail in frames: 5 to 50
  particles["effect"].options.trail.length = Math.round(Math.max(10, Math.min(100, length)) / 2);
  paint(particles, palette(params, colors));
  return out;
}

/**
 * Particle text options with density and colors applied. The renderer fills
 * in the text and the font from the name element it draws over.
 */
export function particleTextOptions(
  params: ParamValues = {},
  colors?: ThemeColors
): ParticlePreset {
  const out = JSON.parse(JSON.stringify(PARTICLE_TEXT)) as Loose;
  const density = typeof params["density"] === "number" ? params["density"] : PIVOT;
  out["particles"].number.value = textDotCount(density);
  const custom = params["palette"] === "custom" ? params["color"] : undefined;
  const ink =
    typeof custom === "string" && /^#[0-9a-f]{6}$/i.test(custom) ? custom : (colors?.text ?? null);
  if (ink) out["particles"]["paint"] = { color: { value: ink } };
  return out;
}

export const COMET_PARAMS = {
  density: PARTICLE_PARAMS.density,
  length: TRAIL_LENGTH_PARAM,
  palette: PARTICLE_PARAMS.palette,
  color: PARTICLE_PARAMS.color,
} as const satisfies Record<string, ParamSpec>;

export const PARTICLE_TEXT_PARAMS = {
  density: { ...PARTICLE_PARAMS.density, default: PIVOT, label: "Dots" },
  palette: { kind: "choice", options: ["theme", "custom"], default: "theme", label: "Colors" },
  color: { kind: "color", default: "#ffffff", label: "Custom color" },
} as const satisfies Record<string, ParamSpec>;
