import { newLayerNone } from "./newLayers";
import type { EffectEntry } from "./types";

/**
 * Press effects, new in v2. Phase 2 ships the press row (decision 6): a press
 * fires on tap, so phones feel a button effect for the first time.
 */
export const BUTTON_PRESS_EFFECTS: readonly EffectEntry[] = [
  newLayerNone("buttonPress", "No press effect", "button"),
];
