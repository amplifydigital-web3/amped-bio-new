import {
  BORDER_STYLE_LABELS,
  CONTAINER_SHAPE_LABELS,
  type BorderStyle,
  type ContainerShape,
} from "@repo/constants";

// Container row helpers (Theme Engine v2 phase 2, board 03).

/** The shape the row shows: the stored one, or the surface's own. */
export function currentShape(containerStyle: number, stored?: ContainerShape): ContainerShape {
  return stored ?? (containerStyle === 8 ? "arch" : "rounded");
}

/** The collapsed row line (board 03): surface, then shape and border when set. */
export function containerRowValue(
  styleName: string,
  shape: ContainerShape,
  border: BorderStyle,
  hasSurface: boolean
): string {
  if (!hasSurface) return styleName;
  const parts = [styleName];
  if (shape !== "rounded") parts.push(CONTAINER_SHAPE_LABELS[shape]);
  if (border !== "none") parts.push(BORDER_STYLE_LABELS[border]);
  return parts.join(", ");
}
