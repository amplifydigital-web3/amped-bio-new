import {
  gradientCss,
  gradientPresetCss,
  parseLegacyGradient,
  type GradientPreset,
  type GradientStop,
} from "@repo/constants";
import { parseHex, toHex } from "@repo/ui";
import type { Background } from "@/types/editor";

// Gradient helpers for the Background row (Theme Engine v2 phase 2, board 10).
// A built gradient stays a v1 color background: `value` holds its static CSS,
// so v1 renderers draw it as is, and the stops, angle and drift ride along
// for the v2 renderer.

const MIN_STOPS = 2;
export const YOUR_GRADIENT = "Your gradient";

export type Texture = NonNullable<Background["texture"]>;

export const TEXTURES: { value: Texture; label: string }[] = [
  { value: "none", label: "None" },
  { value: "grain", label: "Grain" },
  { value: "dots", label: "Dot grid" },
  { value: "scanlines", label: "Scanlines" },
];

export interface GradientLookState {
  stops: GradientStop[];
  angle: number;
  mesh: boolean;
}

/** The look a background carries: its stops, a parsed v1 gradient, or null. */
export function lookOf(background?: Background): GradientLookState | null {
  if (!background || background.type !== "color") return null;
  if (background.stops && background.stops.length >= MIN_STOPS) {
    return {
      stops: background.stops.map(stop => ({ ...stop })),
      angle: background.angle ?? 180,
      mesh: background.mesh === true,
    };
  }
  if (background.value && /gradient\(/i.test(background.value)) {
    const parsed = parseLegacyGradient(background.value);
    return { stops: parsed.stops, angle: parsed.angle, mesh: false };
  }
  return null;
}

export function presetLook(preset: GradientPreset): GradientLookState {
  return {
    stops: preset.stops.map(stop => ({ ...stop })),
    angle: preset.angle,
    mesh: preset.mesh === true,
  };
}

export function presetMatches(preset: GradientPreset, background?: Background) {
  if (!background || background.type !== "color") return false;
  if (background.id) return background.id === preset.id;
  return background.value === gradientPresetCss(preset);
}

/** A gradient background the row writes. Drift and texture carry over. */
export function gradientBackground(
  look: GradientLookState,
  extra: { label: string; id?: string; css?: string; drift?: boolean; texture?: Texture }
): Background {
  return {
    type: "color",
    value: extra.css ?? gradientCss(look),
    label: extra.label,
    ...(extra.id ? { id: extra.id } : {}),
    stops: look.stops.map(stop => ({ ...stop })),
    angle: look.angle,
    ...(look.mesh ? { mesh: true } : {}),
    ...(extra.drift ? { drift: true } : {}),
    ...(extra.texture && extra.texture !== "none" ? { texture: extra.texture } : {}),
  };
}

/** The color halfway between two stops. */
export function mixColors(a: string, b: string) {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex({ r: (x.r + y.r) / 2, g: (x.g + y.g) / 2, b: (x.b + y.b) / 2 }).toLowerCase();
}
