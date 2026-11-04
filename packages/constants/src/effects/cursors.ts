import { newLayerNone } from "./newLayers";
import type { EffectEntry } from "./types";

/**
 * Cursor effects, new in v2. Phase 3 ships them for fine pointers only. They
 * never replace the system cursor or hide focus rings.
 */
export const CURSOR_EFFECTS: readonly EffectEntry[] = [
  newLayerNone("cursor", "Your visitors keep their own cursor", "cursor"),
];
