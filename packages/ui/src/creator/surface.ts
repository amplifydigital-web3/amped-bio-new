import type { BorderStyle, ContainerShape } from "@repo/constants";
import type { CreatorLook } from "./look";

/**
 * Theme Engine v2 phase 2, Container row (spec 3.5, board 03): the shape and
 * border sub controls drawn on top of a surface. Literal Tailwind strings, so
 * the scanner sees them; cn (tailwind-merge) lets a shape replace the
 * surface's own radius and a border replace its own border or shadow.
 *
 * Rounded and None are the surface as v1 draws it, so every saved page keeps
 * its look. The retired Arch surface is already arched.
 */

export const CONTAINER_SHAPE_CLASSES: Readonly<Record<ContainerShape, string>> = {
  rounded: "",
  pill: "rounded-[89px]",
  // corner-shape draws a true squircle where supported; elsewhere a 55 radius
  squircle: "rounded-[55px] [corner-shape:squircle]",
  // 13 px corners
  cut: "rounded-none [clip-path:polygon(13px_0,calc(100%-13px)_0,100%_13px,100%_calc(100%-13px),calc(100%-13px)_100%,13px_100%,0_calc(100%-13px),0_13px)]",
  // The browser scales the oversized top radii down to a half circle; 89 on
  // top keeps the photo and a long name inside the curve
  arch: "rounded-t-[999px] rounded-b-[21px] pt-[89px] sm:pt-[89px]",
  blob: "rounded-[144px_55px_89px_34px]",
};

export const BORDER_STYLE_CLASSES: Readonly<Record<BorderStyle, string>> = {
  none: "",
  hairline: "border border-[color:color-mix(in_srgb,var(--amped-font,#000000)_24%,transparent)]",
  thick: "border-[3px] border-[color:var(--amped-btn)]",
  dashed:
    "border-2 border-dashed border-[color:color-mix(in_srgb,var(--amped-font,#000000)_40%,transparent)]",
  // A 3 px conic ring in the theme colors, masked to the edge so it follows
  // any radius and leaves a see through card see through
  gradient:
    "relative after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:p-[3px] after:content-[''] after:[background:conic-gradient(from_0deg,var(--amped-btn),var(--amped-font,#000000),var(--amped-btn))] after:[-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] after:[-webkit-mask-composite:xor] after:[mask-composite:exclude]",
  glow: "shadow-[0_0_21px_var(--amped-glow)]",
};

/** The shape class for a surface, or "" when the surface keeps its own. */
export function containerShapeClass(surfaceId: string, shape: ContainerShape): string {
  if (surfaceId === "container.none") return "";
  if (surfaceId === "container.arch" && shape === "arch") return "";
  return CONTAINER_SHAPE_CLASSES[shape] ?? "";
}

/** The shape and border classes the look's container carries. */
export function containerSurfaceClass(look: CreatorLook): string {
  const { id, shape, border } = look.v2.container;
  if (id === "container.none") return "";
  return [containerShapeClass(id, shape), BORDER_STYLE_CLASSES[border] ?? ""]
    .filter(Boolean)
    .join(" ");
}
