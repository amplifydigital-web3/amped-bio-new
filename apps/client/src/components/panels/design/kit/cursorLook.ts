import { CURSOR_EFFECTS, type EffectEntry, type ThemeConfig } from "@repo/constants";

// Cursor row (Theme Engine v2 phase 3c, spec 3.5): None and the seven cursor
// effects. Stored by id as cursorEffectId; None clears it.

export const CURSOR_TILES: readonly EffectEntry[] = CURSOR_EFFECTS.filter(entry => !entry.retired);

/** The selected tile index: a stored id, else None. */
export function cursorIndex(stored?: string): number {
  const index = CURSOR_TILES.findIndex(entry => entry.id === stored);
  return index === -1 ? 0 : index;
}

/** The patch a cursor tile writes. A new pick starts from default params. */
export function cursorPatch(entry: EffectEntry): Partial<ThemeConfig> {
  return {
    cursorEffectId: entry.id === "cursor.none" ? undefined : entry.id,
    cursorParams: undefined,
  };
}
