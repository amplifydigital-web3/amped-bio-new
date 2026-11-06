import { newLayerNone } from "./newLayers";
import type { EffectEntry, ParamSpec, ThemeColors } from "./types";

/**
 * Cursor effects, new in v2 (spec 3.5, Cursor row), phase 3c. All fine pointer
 * only: none render on touch. They never hide the system cursor or cover
 * focus rings (pointer-events none, below the dialog layer), and they drop
 * first on a weak device (spec 3.7). Glow, Ring and the trails run on the 2D
 * canvas engine; Blob is a WebGL metaball; Splash is the heaviest entry and
 * counts as two heavy effects in the page cost.
 */

export const CURSOR_COLOR_PARAMS = {
  palette: { kind: "choice", options: ["theme", "custom"], default: "theme", label: "Colors" },
  color: { kind: "color", default: "#ffffff", label: "Custom color" },
} as const satisfies Record<string, ParamSpec>;

export const CURSOR_TRAIL_PARAMS = {
  length: { kind: "range", min: 8, max: 34, step: 1, default: 21, label: "Trail length" },
  ...CURSOR_COLOR_PARAMS,
} as const satisfies Record<string, ParamSpec>;

const cursor = (
  id: string,
  label: string,
  description: string,
  extra: Partial<EffectEntry> & Pick<EffectEntry, "render">
): EffectEntry => ({
  id: `cursor.${id}`,
  layer: "cursor",
  label,
  description,
  tier: "plus",
  engine: "canvas",
  cost: "light",
  source: "amped",
  colorMode: "theme",
  pointer: "fine",
  params: CURSOR_COLOR_PARAMS,
  loop: true,
  preview: { sample: "cursor" },
  addedIn: 2,
  ...extra,
});

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function vec3(value: string): number[] {
  const n = parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const blobColors = (p: Readonly<Record<string, number | string>>, c: ThemeColors) => {
  const a = p["palette"] === "custom" ? hex(p["color"], c.button) : hex(c.button, "#5650a2");
  return { uA: vec3(a), uB: vec3(hex(c.text, "#16152b")) };
};

export const CURSOR_EFFECTS: readonly EffectEntry[] = [
  newLayerNone("cursor", "Your visitors keep their own cursor", "cursor"),
  cursor("glow", "Glow", "A soft light follows the pointer", {
    render: { kind: "canvas", module: "glow" },
  }),
  cursor("ring", "Ring", "A ring follows the pointer", {
    render: { kind: "canvas", module: "ring" },
  }),
  cursor("spark-trail", "Spark trail", "Sparks fly from the pointer", {
    params: CURSOR_TRAIL_PARAMS,
    render: { kind: "canvas", module: "spark-trail" },
  }),
  cursor("pixel-trail", "Pixel trail", "Pixels light up where the pointer goes", {
    params: CURSOR_TRAIL_PARAMS,
    render: { kind: "canvas", module: "pixel-trail" },
  }),
  cursor("dot-trail", "Dot trail", "A line of dots follows the pointer", {
    params: CURSOR_TRAIL_PARAMS,
    render: { kind: "canvas", module: "dot-trail" },
  }),
  cursor("blob", "Blob", "A liquid blob follows the pointer", {
    tier: "showcase",
    engine: "webgl",
    cost: "heavy",
    render: {
      kind: "webgl",
      program: "cursor-blob",
      uniforms: (p, c) => ({ ...blobColors(p, c), uI: 1 }),
      // Transparent: the blob draws over the page, so there is no poster
      poster: () => "transparent",
    },
    preview: { sample: "cursor", video: true },
  }),
  cursor("splash", "Splash", "Ink splashes where the pointer moves", {
    tier: "showcase",
    cost: "heavy",
    costWeight: 2,
    render: { kind: "canvas", module: "splash" },
    preview: { sample: "cursor", video: true },
  }),
];
