"use client";

import { useEffect, useMemo, useRef } from "react";
import { clampParams, type EffectEntry, type ParamValues, type ThemeColors } from "@repo/constants";
import { cn } from "../utils";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { particleLayerOptions } from "./particles-options";

/**
 * Theme Engine v2, phase 1c: the one particle overlay for the creator page,
 * the editor preview and later the Design tiles. It replaces the two app
 * copies of ParticlesBackground behind SHOW_THEME_V2 (spec 3.6).
 *
 * The overlay's options come from its registry entry (color aware factories,
 * scenes.particles.ts). The engine loads after first paint, in its own chunk.
 */

function afterFirstPaint(run: () => void): () => void {
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (win.requestIdleCallback) {
    const handle = win.requestIdleCallback(run, { timeout: 1000 });
    return () => win.cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(run, 200);
  return () => window.clearTimeout(timer);
}

export interface ParticlesLayerProps {
  /** A scene overlay entry. Null, none or retired entries render nothing (041 I06). */
  entry: EffectEntry | null;
  params?: ParamValues;
  colors: ThemeColors;
  /** Pause motion (041 I02): the particles hold still where they are. */
  paused?: boolean;
  className?: string;
}

export function ParticlesLayer({
  entry,
  params,
  colors,
  paused = false,
  className = "absolute inset-0",
}: ParticlesLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const still = reducedMotion || paused;
  const host = useRef<HTMLDivElement>(null);

  const base = useMemo(() => {
    if (!entry || entry.retired || entry.render.kind !== "particles") return null;
    return entry.render.options(clampParams(entry, params), colors);
  }, [entry, params, colors]);

  useEffect(() => {
    const element = host.current;
    if (!base || !element) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const cancelStart = afterFirstPaint(() => {
      void import("./particles-runtime")
        .then(runtime =>
          cancelled
            ? undefined
            : runtime.mountParticles(element, particleLayerOptions(base, { still, finePointer }))
        )
        .then(container => {
          if (cancelled) container?.destroy();
          else {
            destroy = () => container?.destroy();
            // Still: hold the first frame and stop the draw loop, so a paused
            // page and a grid of still tiles cost nothing per frame
            if (still) requestAnimationFrame(() => container?.pause());
          }
        })
        .catch(() => {
          // A failed engine load leaves the scene base showing, as with no overlay
        });
    });
    // A pause change restarts the overlay so the frame holds where it is
    return () => {
      cancelled = true;
      cancelStart();
      destroy?.();
    };
  }, [base, still]);

  if (!base) return null;
  return <div ref={host} aria-hidden className={cn("pointer-events-none", className)} />;
}
