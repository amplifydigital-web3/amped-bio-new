import type { EffectEntry, ParamSpec, ParamValues, ThemeColors } from "./types";

/**
 * Theme Engine v2 phase 3b (spec 3.5, board 01): the shader scenes. Twenty
 * Showcase, Heavy WebGL scenes on the shared engine (decision 13): the 14
 * gallery shaders, the 5 pointer reactive shaders and Galaxy field. Each is
 * Amped's own GLSL, written for this engine (decision 3), so source is amped.
 *
 * The GLSL lives in packages/ui/src/motion/shaders and loads in its own chunk
 * with the engine; this file holds what every app can read without it: the
 * params, the uniforms (palette as vec3, intensity, reactivity, density) and
 * the poster gradient that paints first and stays on weak devices.
 */

const range = (label: string, def: number, min = 0, max = 100, unit?: string): ParamSpec => ({
  kind: "range",
  min,
  max,
  step: min === 50 ? 10 : 1,
  default: def,
  label,
  ...(unit ? { unit } : {}),
});

/** original paints the scene's own colors; theme the creator's; custom one color and two shades of it. */
const PALETTE = {
  palette: {
    kind: "choice",
    options: ["original", "theme", "custom"],
    default: "original",
    label: "Colors",
  },
  color: { kind: "color", default: "#7a4fd1", label: "Custom color" },
} as const satisfies Record<string, ParamSpec>;

export const SHADER_GALLERY_PARAMS = {
  intensity: range("Intensity", 70),
  speed: range("Speed", 50),
  ...PALETTE,
} as const satisfies Record<string, ParamSpec>;

export const SHADER_REACTIVE_PARAMS = {
  ...SHADER_GALLERY_PARAMS,
  reactivity: range("Pointer reactivity", 60),
} as const satisfies Record<string, ParamSpec>;

export const GALAXY_FIELD_PARAMS = {
  points: range("Stars", 100, 50, 200, "k"),
  speed: range("Speed", 50),
  ...PALETTE,
} as const satisfies Record<string, ParamSpec>;

type Hex = `#${string}`;
type Triad = readonly [Hex, Hex, Hex];

function rgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return [0, 0, 0];
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): Hex {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mixHex(a: string, b: string, t: number): Hex {
  const x = rgb(a);
  const y = rgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Rotates the hue of a color by deg, keeping lightness and saturation. */
function hueShift(hex: string, deg: number): Hex {
  const [r, g, b] = rgb(hex).map(v => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return toHex([r * 255, g * 255, b * 255]);
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The three colors a scene paints with, from its palette param. */
export function shaderPalette(original: Triad, params: ParamValues, colors: ThemeColors): Triad {
  const palette = params["palette"];
  if (palette === "theme") {
    return [colors.button, colors.text, colors.container].map(c =>
      HEX.test(c) ? c : "#000000"
    ) as unknown as Triad;
  }
  if (palette === "custom") {
    const custom = String(params["color"] ?? "");
    const base = HEX.test(custom) ? (custom as Hex) : PALETTE.color.default;
    return [base, hueShift(base, 40), mixHex(base, "#ffffff", 0.6)];
  }
  return original;
}

function vec3(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return [r / 255, g / 255, b / 255];
}

const pct = (params: ParamValues, key: string, fallback: number) => {
  const value = params[key];
  return (typeof value === "number" ? value : fallback) / 100;
};

interface ShaderSpec {
  key: string;
  label: string;
  description: string;
  original: Triad;
  kind: "gallery" | "reactive" | "field";
  /** The poster's shape; every poster is a CSS gradient in the palette. */
  poster: "radial" | "top" | "bottom" | "veil";
}

function posterCss(spec: ShaderSpec, [a, b, c]: Triad): string {
  const dark = mixHex(a, "#000000", 0.82);
  switch (spec.poster) {
    case "top":
      return `radial-gradient(120% 80% at 50% 0%, ${mixHex(c, a, 0.4)} 0%, ${mixHex(b, dark, 0.5)} 45%, ${dark} 100%)`;
    case "bottom":
      return `linear-gradient(180deg, ${dark} 0%, ${mixHex(a, dark, 0.45)} 55%, ${mixHex(b, dark, 0.2)} 100%)`;
    case "veil":
      return `radial-gradient(90% 70% at 50% 45%, ${mixHex(b, "#000000", 0.6)} 0%, ${mixHex(a, "#000000", 0.9)} 70%, #050508 100%)`;
    default:
      return `radial-gradient(110% 90% at 50% 40%, ${mixHex(c, b, 0.3)} 0%, ${mixHex(b, a, 0.5)} 40%, ${dark} 100%)`;
  }
}

const SHADERS: readonly ShaderSpec[] = [
  {
    key: "aurora",
    label: "Aurora",
    description: "Northern lights drift across the sky",
    original: ["#2bd4a4", "#3a7bd5", "#a46bff"],
    kind: "gallery",
    poster: "bottom",
  },
  {
    key: "silk",
    label: "Silk",
    description: "Soft folds of silk catch the light",
    original: ["#3b1d60", "#c06c84", "#ffd6e0"],
    kind: "gallery",
    poster: "radial",
  },
  {
    key: "iridescence",
    label: "Iridescence",
    description: "Shifting rainbow film like a soap bubble",
    original: ["#6ee7f9", "#a78bfa", "#f9a8d4"],
    kind: "gallery",
    poster: "radial",
  },
  {
    key: "liquid-chrome",
    label: "Liquid chrome",
    description: "Flowing mirror metal",
    original: ["#9ad1ff", "#cfd8e3", "#ffffff"],
    kind: "gallery",
    poster: "radial",
  },
  {
    key: "plasma",
    label: "Plasma",
    description: "Bright plasma waves blend and swirl",
    original: ["#ff3cac", "#784ba0", "#2b86c5"],
    kind: "gallery",
    poster: "radial",
  },
  {
    key: "galaxy",
    label: "Galaxy",
    description: "A spiral galaxy turns slowly",
    original: ["#ff9a8b", "#7f5af0", "#fff1d6"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "threads",
    label: "Threads",
    description: "Glowing threads wave side by side",
    original: ["#5ee7df", "#b490ca", "#ffffff"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "lightning",
    label: "Lightning",
    description: "A bolt flickers through the dark",
    original: ["#1b1f3b", "#7aa2ff", "#eaf2ff"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "orb",
    label: "Orb",
    description: "A glowing orb with a living rim",
    original: ["#7c3aed", "#22d3ee", "#f0abfc"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "dark-veil",
    label: "Dark veil",
    description: "Dark smoke moves behind your page",
    original: ["#1e1b4b", "#4c1d95", "#9d174d"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "grainient",
    label: "Grainient",
    description: "A grainy gradient that slowly shifts",
    original: ["#ff8a5b", "#ea526f", "#25ced1"],
    kind: "gallery",
    poster: "bottom",
  },
  {
    key: "light-rays",
    label: "Light rays",
    description: "Rays of light fall from above",
    original: ["#0f172a", "#fde68a", "#fff7d6"],
    kind: "gallery",
    poster: "top",
  },
  {
    key: "dot-field",
    label: "Dot field",
    description: "A field of dots pulses in waves",
    original: ["#38bdf8", "#818cf8", "#f472b6"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "ripple-grid",
    label: "Ripple grid",
    description: "A grid that ripples from the center",
    original: ["#22d3ee", "#6366f1", "#e879f9"],
    kind: "gallery",
    poster: "veil",
  },
  {
    key: "ferrofluid",
    label: "Ferrofluid",
    description: "Liquid metal drops follow the pointer",
    original: ["#0b0b12", "#94a3b8", "#e2e8f0"],
    kind: "reactive",
    poster: "veil",
  },
  {
    key: "molten-metal",
    label: "Molten metal",
    description: "Glowing metal flows around the pointer",
    original: ["#7f1d1d", "#f97316", "#fde047"],
    kind: "reactive",
    poster: "radial",
  },
  {
    key: "topography",
    label: "Topography",
    description: "Contour lines rise under the pointer",
    original: ["#0f766e", "#5eead4", "#ecfeff"],
    kind: "reactive",
    poster: "veil",
  },
  {
    key: "faulty-terminal",
    label: "Faulty terminal",
    description: "An old screen glitches near the pointer",
    original: ["#052e16", "#22c55e", "#bbf7d0"],
    kind: "reactive",
    poster: "veil",
  },
  {
    key: "letter-glitch",
    label: "Letter glitch",
    description: "Letters flicker and change near the pointer",
    original: ["#0f172a", "#22d3ee", "#a78bfa"],
    kind: "reactive",
    poster: "veil",
  },
  {
    key: "galaxy-field",
    label: "Galaxy field",
    description: "Deep space with layers of stars",
    original: ["#93c5fd", "#c4b5fd", "#ffffff"],
    kind: "field",
    poster: "veil",
  },
];

function shaderEntry(spec: ShaderSpec): EffectEntry {
  const params =
    spec.kind === "reactive"
      ? SHADER_REACTIVE_PARAMS
      : spec.kind === "field"
        ? GALAXY_FIELD_PARAMS
        : SHADER_GALLERY_PARAMS;
  return {
    id: `scene.${spec.key}`,
    layer: "scene",
    label: spec.label,
    description: spec.description,
    tier: "showcase",
    engine: "webgl",
    cost: "heavy",
    source: "amped",
    colorMode: "theme",
    ...(spec.kind === "reactive" ? { pointer: "fine" as const } : {}),
    params,
    loop: true,
    render: {
      kind: "webgl",
      program: spec.key,
      uniforms: (p, c) => {
        const [a, b, cc] = shaderPalette(spec.original, p, c);
        return {
          uA: vec3(a),
          uB: vec3(b),
          uC: vec3(cc),
          uI: spec.kind === "field" ? 1 : pct(p, "intensity", 70),
          uReact: spec.kind === "reactive" ? pct(p, "reactivity", 60) : 0,
          // 50k to 200k stars, as 0 to 1
          uDensity: spec.kind === "field" ? (pct(p, "points", 100) * 100 - 50) / 150 : 0,
        };
      },
      poster: (c, p = {}) => posterCss(spec, shaderPalette(spec.original, p, c)),
    },
    preview: { sample: "scene", video: true },
    addedIn: 2,
  };
}

export const SHADER_SCENES: readonly EffectEntry[] = SHADERS.map(shaderEntry);
