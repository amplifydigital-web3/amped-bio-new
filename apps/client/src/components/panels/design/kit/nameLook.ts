import {
  getEffect,
  isNameEntrance,
  nameSettle,
  type EffectEntry,
  type ThemeConfig,
} from "@repo/constants";
import { NAME_EFFECT_COLORS } from "@repo/ui";

// Name row (Theme Engine v2 phase 2, board 08).

export interface NameTile {
  /** The v1 integer; for a v2 only effect, the nearest v1 look. */
  id: number;
  entry: EffectEntry;
  /** A v2 only effect, stored as heroEffectId. */
  effectId?: string;
}

/** The six name effects the editor offers today, in today's order. */
const V1_NAMES: [number, string][] = [
  [0, "name.none"],
  [2, "name.glow"],
  [6, "name.wave"],
  [7, "name.neon"],
  [8, "name.rainbow"],
  [9, "name.glitch"],
];

/** New core effects and the v1 look a renderer without the flag draws instead. */
const V2_NAMES: [string, number][] = [
  ["name.shiny", 2],
  ["name.gradient-sweep", 2],
  ["name.outline", 0],
  ["name.chrome", 2],
  ["name.shadow-stack", 0],
  ["name.focus-in", 0],
  ["name.letter-rise", 0],
  ["name.type-on", 0],
  ["name.decrypt", 0],
];

export const NAME_TILES: NameTile[] = [
  ...V1_NAMES.map(([id, effectId]) => ({ id, entry: getEffect("name", effectId) })),
  ...V2_NAMES.map(([effectId, id]) => ({ id, effectId, entry: getEffect("name", effectId) })),
];

/** The patch a name tile writes: a v1 tile clears the v2 id; a new pick starts from default params. */
export function namePatch(tile: NameTile): Partial<ThemeConfig> {
  return { heroEffect: tile.id, heroEffectId: tile.effectId, heroEffectParams: undefined };
}

/** The selected tile: a stored v2 id first, else the v1 integer. */
export function nameIndex(heroEffect: number, storedId?: string): number {
  return NAME_TILES.findIndex(t =>
    storedId ? t.effectId === storedId : !t.effectId && t.id === heroEffect
  );
}

/** The collapsed row line: the label, with how it plays (board 08: Shiny, plays once). */
export function nameRowValue(entry: EffectEntry, stored?: "once" | "always"): string {
  if (isNameEntrance(entry)) return `${entry.label}, plays once`;
  if (!entry.loop) return entry.label;
  return nameSettle(entry, stored) === "once"
    ? `${entry.label}, plays once`
    : `${entry.label}, loops`;
}

/**
 * The colors an effect paints over the card, for the 3:1 guard (030 I03).
 * Effects in the text color are measured by the card guard already.
 */
export function namePaintedColors(
  entry: EffectEntry,
  values: Pick<ThemeConfig, "buttonColor" | "fontColor">
): string[] {
  if (entry.legacyId !== undefined) return NAME_EFFECT_COLORS[entry.legacyId] ?? [];
  if (entry.id === "name.chrome") return ["#6B6B6B", "#C8C8C8"];
  if (entry.id === "name.gradient-sweep") {
    return [values.buttonColor, values.fontColor].filter((c): c is string => Boolean(c));
  }
  return [];
}
