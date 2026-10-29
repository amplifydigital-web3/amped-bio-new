import type { BORDER_STYLES, BUTTON_SHAPES, CONTAINER_SHAPES } from "../theme";

/**
 * Labels for the surface sub controls (spec 3.5, decision 5): shape and
 * border on the container (board 03) and the buttons (board 07). Shapes and
 * borders are params on the surface, not registry ids, so six surfaces, six
 * shapes and six borders give every combination from a few entries.
 */

export type ContainerShape = (typeof CONTAINER_SHAPES)[number];
export type ButtonShape = (typeof BUTTON_SHAPES)[number];
export type BorderStyle = (typeof BORDER_STYLES)[number];

export const CONTAINER_SHAPE_LABELS: Readonly<Record<ContainerShape, string>> = {
  rounded: "Rounded",
  pill: "Pill",
  squircle: "Squircle",
  cut: "Cut corners",
  arch: "Arch",
  blob: "Blob",
};

export const BORDER_STYLE_LABELS: Readonly<Record<BorderStyle, string>> = {
  none: "None",
  hairline: "Hairline",
  thick: "Thick",
  dashed: "Dashed",
  gradient: "Gradient",
  glow: "Glow",
};
