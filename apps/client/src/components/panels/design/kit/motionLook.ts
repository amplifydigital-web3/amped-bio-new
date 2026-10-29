import { getEffect } from "@repo/constants";

// Button hover and press rows (Theme Engine v2 phase 2, board 09).

export interface HoverTile {
  /** The v1 integer; for a v2 only hover, the nearest v1 look. */
  id: number;
  name: string;
  /** A v2 only hover, stored as buttonEffectId. */
  effectId?: string;
}

export const V1_HOVERS: HoverTile[] = [
  { id: 0, name: "None" },
  { id: 1, name: "Scale" },
  { id: 2, name: "Glow" },
  { id: 3, name: "Slide" },
  { id: 4, name: "Bounce" },
  { id: 5, name: "Pulse" },
  { id: 6, name: "Shake" },
  { id: 7, name: "Rotate" },
  { id: 8, name: "Pop" },
  { id: 9, name: "Shine" },
];

/** New core hovers and the v1 look a renderer without the flag draws instead. */
const V2_HOVERS: [string, number][] = [
  ["buttonHover.fill-sweep", 9],
  ["buttonHover.underline-grow", 0],
  ["buttonHover.border-draw", 2],
  ["buttonHover.icon-slide", 3],
  ["buttonHover.arrow-nudge", 3],
];

export function hoverTiles(themeV2On: boolean): HoverTile[] {
  if (!themeV2On) return V1_HOVERS;
  return [
    ...V1_HOVERS,
    ...V2_HOVERS.map(([effectId, id]) => ({
      id,
      name: getEffect("buttonHover", effectId).label,
      effectId,
    })),
  ];
}

/** The patch a hover tile writes: a v1 tile clears the v2 id; a new pick starts from default params. */
export function hoverPatch(tile: HoverTile) {
  return { buttonEffect: tile.id, buttonEffectId: tile.effectId, buttonEffectParams: undefined };
}

/** The selected hover tile: a stored v2 id first, else the v1 integer. */
export function hoverIndex(tiles: HoverTile[], buttonEffect: number, storedId?: string): number {
  return tiles.findIndex(t =>
    storedId ? t.effectId === storedId : !t.effectId && t.id === buttonEffect
  );
}

export const PRESS_IDS = ["buttonPress.none", "buttonPress.ripple", "buttonPress.dip"] as const;
export type PressId = (typeof PRESS_IDS)[number];

/** The press a config carries; unknown ids read as none. */
export function currentPress(stored?: string): PressId {
  return (PRESS_IDS as readonly string[]).includes(stored ?? "")
    ? (stored as PressId)
    : "buttonPress.none";
}

/** The patch a press tile writes: None clears the field. */
export function pressPatch(id: PressId) {
  return { buttonPressId: id === "buttonPress.none" ? undefined : id };
}
