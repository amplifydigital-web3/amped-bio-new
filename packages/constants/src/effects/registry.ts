import { BUTTON_HOVER_EFFECTS } from "./buttonHovers";
import { BUTTON_PRESS_EFFECTS } from "./buttonPresses";
import { BUTTON_EFFECTS } from "./buttons";
import { CONTAINER_EFFECTS } from "./containers";
import { CURSOR_EFFECTS } from "./cursors";
import { NAME_EFFECTS } from "./names";
import { SCENE_EFFECTS } from "./scenes";
import {
  EFFECT_LAYERS,
  type EffectCost,
  type EffectEngine,
  type EffectEntry,
  type EffectLayer,
  type EffectTier,
  type ParamValues,
} from "./types";

/**
 * The effect registry (spec 3.2). One list per layer, one lookup by id. The
 * registry test (packages/constants/test/effects.test.ts) enforces the rules:
 * unique ids, the id pattern, legacy coverage, cost and tier by engine,
 * defaults inside their ranges, and compliant copy.
 */

export const EFFECTS_BY_LAYER: Readonly<Record<EffectLayer, readonly EffectEntry[]>> = {
  scene: SCENE_EFFECTS,
  container: CONTAINER_EFFECTS,
  button: BUTTON_EFFECTS,
  buttonHover: BUTTON_HOVER_EFFECTS,
  buttonPress: BUTTON_PRESS_EFFECTS,
  name: NAME_EFFECTS,
  cursor: CURSOR_EFFECTS,
};

export const ALL_EFFECTS: readonly EffectEntry[] = EFFECT_LAYERS.flatMap(
  layer => EFFECTS_BY_LAYER[layer]
);

const BY_ID: ReadonlyMap<string, EffectEntry> = new Map(
  ALL_EFFECTS.map(entry => [entry.id, entry])
);

type IdTuple = readonly [string, ...string[]];

const idsOf = (layer: EffectLayer): IdTuple => {
  const ids = EFFECTS_BY_LAYER[layer].map(entry => entry.id);
  if (ids.length === 0) throw new Error(`Effect layer ${layer} has no entries`);
  return ids as unknown as IdTuple;
};

/** Every id per layer, including retired ones, for the zod enums in theme.ts. */
export const EFFECT_IDS: Readonly<Record<EffectLayer, IdTuple>> = {
  scene: idsOf("scene"),
  container: idsOf("container"),
  button: idsOf("button"),
  buttonHover: idsOf("buttonHover"),
  buttonPress: idsOf("buttonPress"),
  name: idsOf("name"),
  cursor: idsOf("cursor"),
};

/** The entry for an id, or undefined. */
export function findEffect(id: string): EffectEntry | undefined {
  return BY_ID.get(id);
}

/**
 * What each layer renders when nothing valid is picked. Buttons have no none:
 * a button always has a surface, so they fall back to the v1 default style.
 */
export const LAYER_DEFAULTS: Readonly<Record<EffectLayer, string>> = {
  scene: "scene.none",
  container: "container.none",
  button: "button.soft",
  buttonHover: "buttonHover.none",
  buttonPress: "buttonPress.none",
  name: "name.none",
  cursor: "cursor.none",
};

/** The entry for an id on a layer, or that layer's default entry. */
export function getEffect(layer: EffectLayer, id: string | undefined): EffectEntry {
  const entry = id ? BY_ID.get(id) : undefined;
  if (entry && entry.layer === layer) return entry;
  const fallback = BY_ID.get(LAYER_DEFAULTS[layer]);
  if (!fallback) throw new Error(`Effect layer ${layer} has no default entry`);
  return fallback;
}

export interface EffectFilter {
  tier?: EffectTier;
  cost?: EffectCost;
  engine?: EffectEngine;
  /** Include retired entries. Pickers leave this off. */
  includeRetired?: boolean;
}

/** Entries for a picker row, in catalog order. Powers the row filters. */
export function listEffects(layer: EffectLayer, filter: EffectFilter = {}): EffectEntry[] {
  return EFFECTS_BY_LAYER[layer].filter(
    entry =>
      (filter.includeRetired || !entry.retired) &&
      (!filter.tier || entry.tier === filter.tier) &&
      (!filter.cost || entry.cost === filter.cost) &&
      (!filter.engine || entry.engine === filter.engine)
  );
}

/**
 * Clamps stored params to the entry's specs: unknown keys are dropped, ranges
 * are clamped and snapped to the step, choices and text fall back to the
 * default, and missing keys take the default. Pure; runs on the server before
 * a write and in the renderer before a draw.
 */
export function clampParams(
  entry: EffectEntry,
  params: ParamValues = {}
): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [key, spec] of Object.entries(entry.params)) {
    const value = params[key];
    switch (spec.kind) {
      case "range": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          out[key] = spec.default;
          break;
        }
        const clamped = Math.min(spec.max, Math.max(spec.min, value));
        const steps = Math.round((clamped - spec.min) / spec.step);
        out[key] = Math.min(spec.max, Number((spec.min + steps * spec.step).toFixed(6)));
        break;
      }
      case "choice":
        out[key] = typeof value === "string" && spec.options.includes(value) ? value : spec.default;
        break;
      case "color":
        out[key] =
          value === "theme" || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
            ? value
            : spec.default;
        break;
      case "text":
        out[key] = typeof value === "string" ? value.slice(0, spec.maxLength) : spec.default;
        break;
    }
  }
  return out;
}
