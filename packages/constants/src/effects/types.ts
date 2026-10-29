/**
 * Theme Engine v2 effect registry types (docs/features/theme-engine-v2.md, 3.2).
 *
 * The registry is the catalog: one entry per effect, addressed by a stable
 * string id. Theme configs name effects by id and never carry classes, CSS or
 * code (decision 9). This package stays free of React and tsParticles, so
 * render recipes use structural types; the shared renderer in packages/ui
 * (phase 1b) narrows them.
 */

import type { ParticlePreset } from "./particlePresets";

export const EFFECT_LAYERS = [
  "scene",
  "container",
  "button",
  "buttonHover",
  "buttonPress",
  "name",
  "cursor",
] as const;

export type EffectLayer = (typeof EFFECT_LAYERS)[number];
export type EffectTier = "core" | "plus" | "showcase";
export type EffectEngine = "css" | "waapi" | "canvas" | "particles" | "webgl";
export type EffectCost = "still" | "light" | "heavy";
/** Decision 3: a react-bits entry never ships inside a sold theme. */
export type EffectSource = "amped" | "tsparticles" | "react-bits";

export type ParamSpec =
  | {
      kind: "range";
      min: number;
      max: number;
      step: number;
      default: number;
      label: string;
      unit?: string;
    }
  | { kind: "choice"; options: readonly string[]; default: string; label: string }
  /** "theme" reads the creator's colors. */
  | { kind: "color"; default: "theme" | `#${string}`; label: string }
  | { kind: "text"; maxLength: number; default: string; label: string };

export type ParamValues = Readonly<Record<string, number | string>>;

/** The creator's colors as the renderer passes them to an effect. */
export interface ThemeColors {
  button: string;
  buttonText: string;
  container: string;
  text: string;
}

export type CssStyle = Readonly<Record<string, string | number>>;

export type EffectRender =
  /** Tailwind classes. Literal strings so Tailwind can see them. */
  | {
      kind: "class";
      className: string;
      /** What a looping effect shows under Pause motion. Empty renders plain. */
      settledClassName?: string;
    }
  | { kind: "style"; style: (p: ParamValues, c: ThemeColors) => CssStyle }
  | {
      kind: "waapi";
      keyframes: (p: ParamValues, c: ThemeColors) => readonly Record<string, string | number>[];
      options: (p: ParamValues) => Readonly<Record<string, string | number>>;
      trigger: "mount" | "hover" | "press" | "always";
      /**
       * Text entrances (name layer): animate the whole text, each letter
       * (delayed by stagger ms, squeezed to fit 610 ms), or scramble the
       * glyphs until they settle on the text.
       */
      text?: "whole" | "letters" | "scramble";
      stagger?: number;
    }
  /** tsParticles options; phase 1c makes these color aware factories on v4 slim. */
  | {
      kind: "particles";
      options: (p: ParamValues, c: ThemeColors) => ParticlePreset;
      plugins: readonly string[];
    }
  /** poster is the CSS gradient painted before the engine loads. */
  | {
      kind: "webgl";
      shader: string;
      uniforms: (p: ParamValues, c: ThemeColors) => Readonly<Record<string, number | number[]>>;
      poster: (c: ThemeColors) => string;
    }
  | { kind: "canvas"; module: string }
  /** Renders nothing. The none entry of every layer. */
  | { kind: "none" };

/**
 * How the editor tile previews the entry (decision 12). sample names the
 * miniature the tile draws; video marks heavy entries that show a build time
 * thumbnail instead of a live context.
 */
export interface PreviewRecipe {
  sample: "scene" | "card" | "button" | "name" | "cursor";
  video?: boolean;
}

export interface EffectEntry {
  /** Stable, kebab case, never reused: "scene.snow", "name.glow". */
  id: string;
  layer: EffectLayer;
  /** What the eye sees, never the library (decision 10). */
  label: string;
  /** One line, shown as the tile tooltip. */
  description: string;
  tier: EffectTier;
  engine: EffectEngine;
  cost: EffectCost;
  source: EffectSource;
  colorMode: "fixed" | "theme";
  /** Fine pointer only (hover, cursor); phones render the still fallback. */
  pointer?: "fine";
  params: Readonly<Record<string, ParamSpec>>;
  /** Looping effects get the Settle control (once or always). */
  loop?: boolean;
  render: EffectRender;
  preview: PreviewRecipe;
  /** The v1 integer this entry replaces, when it is the primary match. */
  legacyId?: number;
  /** 1 existed in v1, 2 is new in v2. */
  addedIn: 1 | 2;
  /** Hidden from pickers. Kept so v1 rows that still hold the id render. */
  retired?: boolean;
}
