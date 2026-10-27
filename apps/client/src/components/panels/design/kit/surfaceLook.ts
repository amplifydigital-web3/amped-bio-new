import {
  BORDER_STYLE_LABELS,
  BUTTON_SHAPE_LABELS,
  CONTAINER_SHAPE_LABELS,
  type BorderStyle,
  type ButtonShape,
  type ContainerShape,
} from "@repo/constants";

// Container and Buttons row helpers (Theme Engine v2 phase 2, boards 03, 07).

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

/** Buttons row (board 07): the stored shape, or the style's own. */
export function currentButtonShape(buttonStyle: number, stored?: ButtonShape): ButtonShape {
  return stored ?? (buttonStyle === 1 ? "pill" : "rounded");
}

/** The collapsed Buttons line (board 07): style, then shape and border when set. */
export function buttonRowValue(styleName: string, shape: ButtonShape, border: BorderStyle): string {
  const parts = [styleName];
  if (shape !== "rounded") parts.push(BUTTON_SHAPE_LABELS[shape]);
  if (border !== "none") parts.push(BORDER_STYLE_LABELS[border]);
  return parts.join(", ");
}
