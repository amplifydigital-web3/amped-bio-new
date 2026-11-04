"use client";

import { useEffect, useRef } from "react";
import type { ParamValues } from "@repo/constants";
import { usePrefersReducedMotion } from "../use-reduced-motion";

/**
 * Theme Engine v2 TE-3e2 (spec 3.5, board 08): Weight pulse. The name's
 * weight follows the pointer: Boldest when the pointer is on the name,
 * easing to Lightest as it moves half the window away. The name font loads
 * across that range (creatorFontRequests), so the weight moves on the font's
 * own wght axis. Phones, reduced motion and Pause motion show the name at
 * the weight the creator picked.
 */

/** The weight for a pointer at distance d, with reach the distance where it is lightest. */
export function pulseWeight(
  distance: number,
  reach: number,
  lightest: number,
  boldest: number
): number {
  const t = reach > 0 ? Math.min(1, Math.max(0, distance / reach)) : 1;
  // Ease out, so the weight climbs quickly as the pointer nears
  const near = 1 - t * t;
  return Math.round(lightest + (boldest - lightest) * near);
}

export function WeightPulseName({
  text,
  params,
  paused = false,
}: {
  text: string;
  params?: ParamValues;
  paused?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const span = useRef<HTMLSpanElement>(null);
  const lightest = Number(params?.["lightest"]) || 300;
  const boldest = Number(params?.["boldest"]) || 900;

  useEffect(() => {
    const node = span.current;
    if (!node || paused || reducedMotion) return;
    if (window.matchMedia?.("(pointer: fine)").matches !== true) return;
    let frame = 0;
    let weight = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = node.getBoundingClientRect();
      const dx = Math.max(box.left - event.clientX, 0, event.clientX - box.right);
      const dy = Math.max(box.top - event.clientY, 0, event.clientY - box.bottom);
      const reach = Math.max(window.innerWidth, window.innerHeight) / 2;
      weight = pulseWeight(Math.hypot(dx, dy), reach, lightest, boldest);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          node.style.fontWeight = String(weight);
          node.style.fontVariationSettings = `"wght" ${weight}`;
        });
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
      node.style.fontWeight = "";
      node.style.fontVariationSettings = "";
    };
  }, [paused, reducedMotion, lightest, boldest]);

  return (
    <span
      ref={span}
      data-effect="name.weight-pulse"
      className="transition-[font-weight,font-variation-settings] duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
    >
      {text}
    </span>
  );
}
