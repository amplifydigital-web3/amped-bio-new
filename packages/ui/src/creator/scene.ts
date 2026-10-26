import type { CSSProperties } from "react";
import { gradientCss, type Background } from "@repo/constants";

/**
 * Theme Engine v2 phase 2, Background row (spec 3.5, board 10): how the scene
 * base draws a built gradient and a texture. Shared by CreatorPage and the
 * Design tiles, so a tile shows what the page shows.
 */

export interface SceneLook {
  style: CSSProperties;
  /** Literal Tailwind classes, so the scanner sees them. */
  className?: string;
}

/**
 * A built gradient (one with stops). Drift turns a linear gradient once in
 * 21 s and moves a mesh in 13 s; Pause motion and reduced motion keep it
 * still at its own angle. Returns null for any other background, which keeps
 * its v1 rendering.
 */
export function gradientScene(
  background: Background | undefined,
  paused: boolean
): SceneLook | null {
  if (!background || background.type !== "color" || !background.stops) return null;
  const look = {
    stops: background.stops,
    angle: background.angle ?? 180,
    mesh: background.mesh === true,
  };
  const still = background.value || gradientCss(look);
  if (!background.drift || paused) return { style: { background: still } };
  if (look.mesh) {
    return {
      style: { background: still },
      className: "motion-safe:animate-amped-mesh-drift motion-safe:bg-[length:200%_200%]",
    };
  }
  const stops = look.stops.map(stop => `${stop.color} ${stop.at}%`).join(", ");
  return {
    style: {
      background: `linear-gradient(calc(${look.angle}deg + var(--amped-sweep, 0deg)), ${stops})`,
    },
    className: "motion-safe:animate-amped-sweep",
  };
}

const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)' opacity='0.08'/></svg>";

const TEXTURE_STYLES: Record<string, CSSProperties> = {
  // Film grain at 0.08 alpha
  grain: { backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")` },
  // A 13 px dot grid that reads on light and dark backgrounds
  dots: {
    backgroundImage: "radial-gradient(rgba(128, 128, 128, 0.35) 1px, transparent 1.5px)",
    backgroundSize: "13px 13px",
  },
  // 2 px scanlines
  scanlines: {
    backgroundImage:
      "repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.08) 0px, rgba(0, 0, 0, 0.08) 1px, transparent 1px, transparent 2px)",
  },
};

/**
 * The texture overlay for a gradient or an image, or null. Still in every
 * mode; never on colors or videos.
 */
export function textureStyle(background: Background | undefined): CSSProperties | null {
  if (!background?.texture || background.texture === "none") return null;
  const textured =
    background.type === "image" || (background.type === "color" && !!background.stops);
  return textured ? (TEXTURE_STYLES[background.texture] ?? null) : null;
}
