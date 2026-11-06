"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { clampParams, type EffectEntry, type ParamValues, type ThemeColors } from "@repo/constants";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/**
 * Theme Engine v2 phase 3d premium surfaces (spec 3.5, boards 03 and 07, PR
 * TE-3d). The registry class is the surface; these draw its moving part in a
 * layer inside it: the liquid glass edge light, the electric border, the
 * travelling stars, the spotlight and the specular rim on buttons.
 *
 * Every layer is aria-hidden, pointer-events none and below the content. Pause
 * motion and reduced motion settle each one: no loop, no pointer follow. The
 * pointer is read from the parent (the card or the button), so no layer takes
 * a click. Phones (coarse pointers) see Spotlight drift and Specular rest.
 */

export const PREMIUM_SURFACE_IDS = [
  "container.liquid-glass",
  "container.electric-border",
  "container.star-border",
  "container.spotlight",
  "button.specular",
] as const;

/** Speed 0 to 100 (50 is the shipped pace) to a cycle length in ms. 0 holds still. */
export function cycleMs(params: ParamValues, baseMs: number): number | null {
  const speed = typeof params["speed"] === "number" ? (params["speed"] as number) : 50;
  if (speed <= 0) return null;
  return Math.round(baseMs * (50 / speed));
}

/** Extra style the surface itself carries: the liquid glass blur. */
export function premiumSurfaceStyle(entry: EffectEntry, params: ParamValues): CSSProperties {
  if (entry.id !== "container.liquid-glass") return {};
  const p = clampParams(entry, params);
  const blur = `blur(${p["blur"]}px) saturate(160%)`;
  return { backdropFilter: blur, WebkitBackdropFilter: blur };
}

/** Sets --amped-px and --amped-py (0 to 100 percent) on the parent while a fine pointer moves. */
function usePointerVars(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  rest: { x: number; y: number }
) {
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    parent.style.setProperty("--amped-px", `${rest.x}%`);
    parent.style.setProperty("--amped-py", `${rest.y}%`);
    if (!enabled) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      const box = parent.getBoundingClientRect();
      parent.style.setProperty("--amped-px", `${((event.clientX - box.left) / box.width) * 100}%`);
      parent.style.setProperty("--amped-py", `${((event.clientY - box.top) / box.height) * 100}%`);
    };
    const leave = () => {
      parent.style.setProperty("--amped-px", `${rest.x}%`);
      parent.style.setProperty("--amped-py", `${rest.y}%`);
    };
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerleave", leave);
    return () => {
      parent.removeEventListener("pointermove", move);
      parent.removeEventListener("pointerleave", leave);
    };
  }, [ref, enabled, rest.x, rest.y]);
}

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(window.matchMedia?.("(pointer: fine)").matches ?? false);
  }, []);
  return fine;
}

// Below the content: every premium surface class carries isolate, so -1 sits
// over the surface's own background and under its text
const LAYER: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  pointerEvents: "none",
  zIndex: -1,
};

export interface SurfaceFxProps {
  entry: EffectEntry;
  params?: ParamValues;
  colors: ThemeColors;
  paused?: boolean;
}

/** The moving layer of a premium container surface, or null for any other surface. */
export function ContainerFx({ entry, params, colors, paused = false }: SurfaceFxProps) {
  const reducedMotion = usePrefersReducedMotion();
  const still = paused || reducedMotion;
  const p = clampParams(entry, params);
  switch (entry.id) {
    case "container.liquid-glass":
      return <LiquidGlass refraction={Number(p["refraction"])} />;
    case "container.electric-border":
      return (
        <ElectricBorder
          intensity={Number(p["intensity"])}
          cycle={still ? null : cycleMs(p, 2_600)}
          color={p["color"] && p["color"] !== "theme" ? String(p["color"]) : colors.button}
        />
      );
    case "container.star-border":
      return <StarBorder cycle={still ? null : cycleMs(p, 6_000)} color={colors.button} />;
    case "container.spotlight":
      return <Spotlight radius={Number(p["radius"])} still={still} color={colors.button} />;
    default:
      return null;
  }
}

/** The moving layer of a premium button surface (Specular), or null. */
export function ButtonFx({ entry, paused = false }: Omit<SurfaceFxProps, "colors">) {
  const reducedMotion = usePrefersReducedMotion();
  if (entry.id !== "button.specular") return null;
  return <Specular still={paused || reducedMotion} />;
}

/**
 * Liquid glass: the surface class blurs what is behind; this layer adds the
 * light the glass bends at its edges. Refraction 0 to 100 sets how bright and
 * wide that edge light is.
 */
function LiquidGlass({ refraction }: { refraction: number }) {
  const r = Math.max(0, Math.min(100, refraction)) / 100;
  const width = Math.round(8 + r * 26);
  return (
    <span
      aria-hidden
      data-fx="liquid-glass"
      style={{
        ...LAYER,
        boxShadow: [
          `inset 0 0 ${width}px rgba(255,255,255,${(0.15 + r * 0.45).toFixed(2)})`,
          `inset 0 ${Math.round(1 + r * 2)}px 0 rgba(255,255,255,${(0.35 + r * 0.4).toFixed(2)})`,
        ].join(","),
        background: `linear-gradient(135deg, rgba(255,255,255,${(0.08 + r * 0.22).toFixed(2)}) 0%, transparent 34%, transparent 66%, rgba(255,255,255,${(0.04 + r * 0.14).toFixed(2)}) 100%)`,
      }}
    />
  );
}

/**
 * Electric border: a line in the chosen color, displaced by SVG turbulence so
 * it crackles, with a soft glow. The turbulence drifts on a loop; still, the
 * line holds its shape.
 */
function ElectricBorder({
  intensity,
  cycle,
  color,
}: {
  intensity: number;
  cycle: number | null;
  color: string;
}) {
  const id = `amped-electric-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const scale = (Math.max(0, Math.min(100, intensity)) / 100) * 8;
  return (
    <span aria-hidden data-fx="electric-border" style={{ ...LAYER, inset: -2 }}>
      <svg width="0" height="0" style={{ position: "absolute" }} focusable="false">
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="turbulence" baseFrequency="0.02 0.03" numOctaves="2" seed="3">
            {cycle !== null && (
              <animate
                attributeName="baseFrequency"
                dur={`${cycle}ms`}
                values="0.02 0.03;0.03 0.02;0.02 0.03"
                repeatCount="indefinite"
              />
            )}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale={scale} />
        </filter>
      </svg>
      <span
        style={{
          ...LAYER,
          border: `2px solid ${color}`,
          filter: `url(#${id})`,
          boxShadow: `0 0 13px ${color}80, inset 0 0 8px ${color}40`,
        }}
      />
    </span>
  );
}

/** Star border: two points of light travel along the top and bottom edges. */
function StarBorder({ cycle, color }: { cycle: number | null; color: string }) {
  const star = (edge: "top" | "bottom"): CSSProperties => ({
    position: "absolute",
    [edge]: -1,
    left: edge === "top" ? "-34%" : undefined,
    right: edge === "bottom" ? "-34%" : undefined,
    width: "34%",
    height: 3,
    borderRadius: 999,
    background: `radial-gradient(closest-side, ${color}, transparent)`,
    opacity: 0.9,
    animation:
      cycle === null
        ? undefined
        : `amped-star-${edge} ${cycle}ms linear infinite${edge === "bottom" ? ` ${Math.round(cycle / 2)}ms` : ""}`,
    ...(cycle === null ? { [edge === "top" ? "left" : "right"]: "33%" } : {}),
  });
  return (
    <span aria-hidden data-fx="star-border" style={{ ...LAYER, overflow: "hidden" }}>
      <span style={star("top")} />
      <span style={star("bottom")} />
    </span>
  );
}

/**
 * Spotlight: a soft light in the button color under the pointer. On phones it
 * drifts slowly; still, it rests near the top.
 */
function Spotlight({ radius, still, color }: { radius: number; still: boolean; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fine = useFinePointer();
  usePointerVars(ref, fine && !still, { x: 50, y: 21 });
  const size = Math.max(89, Math.min(377, radius)) * 2;
  return (
    <span ref={ref} aria-hidden data-fx="spotlight" style={{ ...LAYER, overflow: "hidden" }}>
      <span
        style={{
          position: "absolute",
          left: "var(--amped-px, 50%)",
          top: "var(--amped-py, 21%)",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, ${color}38, transparent)`,
          transition: fine ? "left 144ms linear, top 144ms linear" : undefined,
          animation: !fine && !still ? "amped-spot-drift 13s ease-in-out infinite" : undefined,
        }}
      />
    </span>
  );
}

/** Specular: a rim of light on the button edge, brightest nearest the pointer. */
function Specular({ still }: { still: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fine = useFinePointer();
  usePointerVars(ref, fine && !still, { x: 21, y: 0 });
  const light =
    "radial-gradient(89px circle at var(--amped-px, 21%) var(--amped-py, 0%), rgba(255,255,255,0.85), transparent 70%)";
  return (
    <span ref={ref} aria-hidden data-fx="specular" style={LAYER}>
      {/* The rim: the light masked to a 1.5 px ring */}
      <span
        style={{
          ...LAYER,
          padding: 1.5,
          background: light,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {/* A faint sheen across the face */}
      <span style={{ ...LAYER, background: light, opacity: 0.18 }} />
    </span>
  );
}
