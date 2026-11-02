import type { ParticlePreset } from "./particlePresets";
import type { ParamSpec } from "./types";

/**
 * Phase 2 Scene core (board 01, spec 3.5): new particle scenes in the v1
 * preset shape (tsParticles v3 options), translated to v4 by toV4Options like
 * the v1 overlays. Amped's own options, written for the slim bundle only: no
 * emitters, paths or trails, so no new dependency. Fountain, Fireworks,
 * Hyperspace, Sea anemone and Squares need the emitters plugin and ship in
 * phase 3 with the trail plugin.
 *
 * No background here: the scene base (Background row) paints behind them.
 */

export interface ScenePreset {
  label: string;
  description: string;
  /** The v1 overlay a renderer without the flag draws instead. */
  fallback: number;
  preset: ParticlePreset;
  /** Emoji scenes keep their glyph colors, so they take no palette. */
  emoji?: boolean;
  /** Emoji rain: the glyphs come from the creator's set param. */
  emojiSet?: string;
}

const move = (speed: number, direction = "none", extra: Record<string, unknown> = {}) => ({
  enable: true,
  speed,
  direction,
  random: false,
  straight: false,
  outModes: { default: "out" },
  ...extra,
});

const hover = { events: { onHover: { enable: true, mode: "repulse" } } };

const emojiScene = (
  glyphs: string[],
  count: number,
  size: { min: number; max: number },
  motion: Record<string, unknown>,
  spin = false
): ParticlePreset => ({
  particles: {
    number: { value: count, density: { enable: true } },
    shape: { type: "emoji", options: { emoji: { value: glyphs } } },
    opacity: { value: 0.9 },
    size: { value: size },
    move: motion,
    ...(spin
      ? {
          rotate: {
            value: { min: 0, max: 360 },
            direction: "random",
            animation: { enable: true, speed: 4 },
          },
        }
      : {}),
  },
});

export const SCENE_PRESETS: Readonly<Record<string, ScenePreset>> = {
  fire: {
    label: "Fire",
    description: "Embers rise from the bottom",
    fallback: 5,
    preset: {
      particles: {
        number: { value: 160, density: { enable: true } },
        color: { value: ["#fdcf58", "#f27d0c", "#f07f13", "#800909", "#757676"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.1, max: 0.6 } },
        size: { value: { min: 1, max: 3 } },
        move: move(3, "top"),
      },
      interactivity: hover,
    },
  },
  triangles: {
    label: "Triangles",
    description: "Points joined into soft triangles",
    fallback: 9,
    preset: {
      particles: {
        number: { value: 70, density: { enable: true } },
        color: { value: "#ffffff" },
        shape: { type: "circle" },
        opacity: { value: 0.5 },
        size: { value: { min: 1, max: 3 } },
        links: {
          enable: true,
          distance: 150,
          color: "#ffffff",
          opacity: 0.4,
          width: 1,
          triangles: { enable: true, opacity: 0.08 },
        },
        move: move(1.5),
      },
      interactivity: hover,
    },
  },
  "big-circles": {
    label: "Big circles",
    description: "Large soft circles drift by",
    fallback: 4,
    preset: {
      particles: {
        number: { value: 14, density: { enable: true } },
        color: { value: ["#5bc0eb", "#fde74c", "#9bc53d", "#e55934", "#fa7921"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.12, max: 0.3 } },
        size: { value: { min: 40, max: 110 } },
        move: move(0.8),
      },
    },
  },
  ambient: {
    label: "Ambient",
    description: "Faint lights glow and fade",
    fallback: 1,
    preset: {
      particles: {
        number: { value: 60, density: { enable: true } },
        color: { value: "#ffffff" },
        shape: { type: "circle" },
        opacity: {
          value: { min: 0.05, max: 0.6 },
          animation: { enable: true, speed: 0.6, sync: false },
        },
        size: { value: { min: 1, max: 4 } },
        move: move(0.4, "none", { random: true }),
      },
    },
  },
  hearts: {
    label: "Hearts",
    description: "Hearts float up",
    fallback: 4,
    emoji: true,
    preset: emojiScene(["❤️", "💖", "💕"], 24, { min: 8, max: 14 }, move(1.2, "top")),
  },
  leaves: {
    label: "Leaves",
    description: "Leaves tumble down",
    fallback: 3,
    emoji: true,
    preset: emojiScene(["🍂", "🍁", "🍃"], 20, { min: 9, max: 15 }, move(1.4, "bottom"), true),
  },
  petals: {
    label: "Petals",
    description: "Petals drift on the breeze",
    fallback: 3,
    emoji: true,
    preset: emojiScene(["🌸"], 24, { min: 7, max: 12 }, move(1.2, "bottom-right"), true),
  },
  "emoji-rain": {
    label: "Emoji rain",
    description: "Your emoji fall like rain",
    fallback: 3,
    emoji: true,
    emojiSet: "✨⭐🌟",
    preset: emojiScene(["✨"], 28, { min: 8, max: 13 }, move(2, "bottom")),
  },
};

/** The set param of Emoji rain: up to six emoji, typed or pasted (spec 3.5). */
export const EMOJI_SET_PARAM = {
  kind: "text",
  maxLength: 48,
  default: "✨⭐🌟",
  label: "Emoji",
} as const satisfies ParamSpec;

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/**
 * The emoji in a set, at most six. Letters, digits and symbols that are not
 * pictographs are dropped, so a set can never spell words on the page.
 */
export function emojiGlyphs(set: string, fallback: string = EMOJI_SET_PARAM.default): string[] {
  const split = (text: string) => {
    const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
    const parts = Segmenter
      ? Array.from(
          new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
          s => s.segment
        )
      : Array.from(text);
    return parts.filter(part => PICTOGRAPH.test(part));
  };
  const glyphs = split(set).slice(0, 6);
  return glyphs.length > 0 ? glyphs : split(fallback);
}
