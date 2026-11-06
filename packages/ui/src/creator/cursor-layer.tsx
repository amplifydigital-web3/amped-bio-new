"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clampParams, type EffectEntry, type ParamValues, type ThemeColors } from "@repo/constants";
import { cn } from "../utils";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { lowPower } from "../motion/watchdog";
import { ShaderLayer, type EffectDrop } from "./shader-layer";

/**
 * Theme Engine v2 phase 3c (spec 3.4, 3.5 and 3.7): the cursor effect, drawn
 * in the scene layer, above the overlay and below the container, so it never
 * covers text, buttons or focus rings, and it never replaces the system
 * cursor. It mounts only when all of these hold:
 * - the showcase flag is on, motion is not paused and reduced motion is off;
 * - the device has a fine pointer (none render on touch);
 * - the device is not weak (the cursor is the first layer to drop).
 * Canvas entries run on the 2D engine; Blob runs on the WebGL engine.
 */

export interface CursorLayerProps {
  entry: EffectEntry | null;
  params?: ParamValues;
  colors: ThemeColors;
  paused?: boolean;
  device?: "strong" | "typical" | "weak";
  showcase?: boolean;
  onDrop?: (drop: EffectDrop) => void;
}

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.("(pointer: fine)");
    if (!query) return;
    setFine(query.matches);
    const change = () => setFine(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return fine;
}

export function CursorLayer({
  entry,
  params,
  colors,
  paused = false,
  device,
  showcase = false,
  onDrop,
}: CursorLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const fine = useFinePointer();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [dropped, setDropped] = useState(false);
  const reported = useRef(false);
  const values = useMemo(() => (entry ? clampParams(entry, params) : {}), [entry, params]);

  const active =
    Boolean(entry) &&
    !entry!.retired &&
    entry!.id !== "cursor.none" &&
    (entry!.render.kind === "canvas" || entry!.render.kind === "webgl");
  const weak = device === "weak" || (device === undefined && lowPower());
  const run = active && showcase && !paused && !reducedMotion && fine && !weak && !dropped;

  const drop = (reason: EffectDrop["reason"]) => {
    if (!entry || reported.current) return;
    reported.current = true;
    onDrop?.({ layer: "cursor", id: entry.id, reason });
  };

  useEffect(() => {
    if (active && showcase && fine && weak) drop("weak");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, showcase, fine, weak]);

  const render = entry?.render;
  useEffect(() => {
    if (!run || render?.kind !== "canvas" || !host.current || !canvas.current) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void Promise.all([import("../motion/canvas"), import("../motion/canvas-effects")])
      .then(async ([engine, effects]) => {
        const factory = await effects.loadCanvasEffect(render.module);
        if (cancelled || !host.current || !canvas.current) return;
        if (!factory) {
          setDropped(true);
          drop("unavailable");
          return;
        }
        const handle = engine.startCanvas({
          canvas: canvas.current,
          host: host.current,
          effect: factory(values, colors),
          pointerArea: document.documentElement,
          dprCap: device === "strong" ? 2 : 1.5,
          onSlow: () => {
            setDropped(true);
            drop("slow");
          },
        });
        if (!handle) {
          setDropped(true);
          drop("unavailable");
          return;
        }
        stop = handle.stop;
      })
      .catch(() => {
        setDropped(true);
        drop("unavailable");
      });
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, render, values, colors, device]);

  if (!run || !entry) return null;
  if (render?.kind === "webgl") {
    return (
      <ShaderLayer
        entry={entry}
        params={values}
        colors={colors}
        device={device}
        showcase
        layer="cursor"
        onDrop={drop => {
          setDropped(true);
          onDrop?.(drop);
        }}
      />
    );
  }
  return (
    <div
      ref={host}
      aria-hidden
      data-effect={entry.id}
      className={cn("pointer-events-none absolute inset-0")}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
