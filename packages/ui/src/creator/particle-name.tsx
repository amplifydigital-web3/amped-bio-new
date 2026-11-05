"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clampParams, type EffectEntry, type ParamValues, type ThemeColors } from "@repo/constants";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { particleLayerOptions } from "./particles-options";

/**
 * TE-3f, Particle text (spec 3.5, board 08): the creator's name drawn in
 * dots over the real heading. The heading keeps its text: screen readers read
 * it, it stays selectable, and its color goes transparent only once the dots
 * have drawn, so a slow engine or a failed load shows the plain name.
 *
 * The plain name shows instead when the showcase flag is off, motion is
 * paused or reduced, the device is weak (spec 3.7: name, loop to once), or the
 * name wraps (the dots draw one line; a long name keeps its own wrapping).
 */

export interface ParticleNameProps {
  entry: EffectEntry;
  params?: ParamValues;
  colors: ThemeColors;
  showcase: boolean;
  paused?: boolean;
  weak?: boolean;
  /** The heading's text; the dots spell it. */
  text: string;
  /** Called with true once the dots are on screen, false when they go. */
  onDrawn: (drawn: boolean) => void;
}

/** The canvas font string for an element, from its computed style. */
export function canvasFont(
  style: Pick<CSSStyleDeclaration, "fontWeight" | "fontSize" | "fontFamily">
): { weight: string; size: string; family: string } {
  return {
    weight: style.fontWeight || "700",
    size: style.fontSize || "26px",
    family: style.fontFamily || "sans-serif",
  };
}

/** True when one line of text at this font fits the width. */
export function fitsOneLine(text: string, font: string, width: number): boolean {
  if (typeof document === "undefined" || width <= 0) return false;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return false;
  ctx.font = font;
  return ctx.measureText(text).width <= width;
}

export function ParticleName({
  entry,
  params,
  colors,
  showcase,
  paused = false,
  weak = false,
  text,
  onDrawn,
}: ParticleNameProps): ReactNode {
  const host = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const active =
    showcase && !paused && !reducedMotion && !weak && entry.render.kind === "particles";
  const [plugins] = useState(() => (entry.render.kind === "particles" ? entry.render.plugins : []));

  useEffect(() => {
    const element = host.current;
    // The host fills the name's own box; the heading sets the width a line may take
    const heading = element?.closest("h1") ?? element?.parentElement;
    if (!active || !element || !heading || entry.render.kind !== "particles") {
      onDrawn(false);
      return;
    }
    const style = window.getComputedStyle(heading);
    const font = canvasFont(style);
    if (!fitsOneLine(text, `${font.weight} ${font.size} ${font.family}`, heading.clientWidth)) {
      onDrawn(false);
      return;
    }
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const base = entry.render.options(clampParams(entry, params), colors) as Record<string, any>;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const options = particleLayerOptions(
      {
        ...base,
        canvasMask: {
          ...base["canvasMask"],
          text: {
            ...base["canvasMask"].text,
            text,
            font: { ...base["canvasMask"].text.font, ...font },
          },
        },
      },
      { still: false, finePointer }
    );
    // The mask is drawn in CSS pixels, so the dots line up with the heading
    options["detectRetina"] = false;
    void import("./particles-runtime")
      .then(runtime => (cancelled ? undefined : runtime.mountParticles(element, options, plugins)))
      .then(container => {
        if (cancelled) {
          container?.destroy();
          return;
        }
        destroy = () => container?.destroy();
        if (container) onDrawn(true);
      })
      .catch(() => onDrawn(false));
    return () => {
      cancelled = true;
      destroy?.();
      onDrawn(false);
    };
    // onDrawn is a state setter from the page; params and colors by value, so
    // a re-render with equal values keeps the dots
  }, [active, entry, JSON.stringify(params ?? {}), JSON.stringify(colors), text, plugins]);

  if (!active) return null;
  return <span ref={host} aria-hidden className="pointer-events-none absolute inset-0 block" />;
}
