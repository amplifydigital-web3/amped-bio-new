"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clampParams, type EffectEntry, type ParamValues, type ThemeColors } from "@repo/constants";
import { cn } from "../utils";
import { MOTION, PRISM_EASE } from "../prism/motion";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { lowPower } from "../motion/watchdog";

/**
 * Theme Engine v2 phase 3a (spec 3.6 and 3.7, PR TE-3a): a WebGL scene on the
 * creator page. The entry's poster (a CSS gradient in the creator's colors)
 * paints first and is the LCP layer. After first paint the engine loads in
 * its own chunk (effects-webgl) and the canvas fades in over 377 ms once the
 * first frame draws. The poster stays when:
 * - the showcase flag is off, the page is paused or reduced motion is set;
 * - the device is weak (Device budget or lowPower());
 * - WebGL or the shader is unavailable;
 * - the frame watchdog measures a median frame over 28 ms (dropped once,
 *   reported through onDrop as theme_effect_dropped).
 */

export interface EffectDrop {
  layer: "scene";
  id: string;
  reason: "weak" | "slow" | "unavailable";
}

export interface ShaderLayerProps {
  /** A webgl scene entry. Anything else renders nothing. */
  entry: EffectEntry | null;
  params?: ParamValues;
  colors: ThemeColors;
  paused?: boolean;
  device?: "strong" | "typical" | "weak";
  /** SHOW_THEME_SHOWCASE: off paints the poster only. */
  showcase?: boolean;
  onDrop?: (drop: EffectDrop) => void;
  className?: string;
}

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

/** Speed 0 to 100 (50 is the shipped pace) to the engine's time multiplier. */
export function shaderSpeed(params: ParamValues): number {
  const raw = params["speed"];
  if (typeof raw !== "number") return 1;
  return Math.max(0, raw) / 50;
}

export function ShaderLayer({
  entry,
  params,
  colors,
  paused = false,
  device,
  showcase = false,
  onDrop,
  className = "absolute inset-0",
}: ShaderLayerProps) {
  const reducedMotion = usePrefersReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [dropped, setDropped] = useState(false);
  const reported = useRef(false);

  const render = entry && !entry.retired && entry.render.kind === "webgl" ? entry.render : null;
  const values = useMemo(() => (entry ? clampParams(entry, params) : {}), [entry, params]);
  const uniforms = useMemo(
    () => (render ? render.uniforms(values, colors) : {}),
    [render, values, colors]
  );
  const poster = render ? render.poster(colors, values) : undefined;
  const weak = device === "weak" || (device === undefined && lowPower());
  const still = !showcase || paused || reducedMotion || dropped;

  const drop = (reason: EffectDrop["reason"]) => {
    if (!entry || reported.current) return;
    reported.current = true;
    onDrop?.({ layer: "scene", id: entry.id, reason });
  };

  // A weak device keeps the poster; the drop is reported once
  useEffect(() => {
    if (render && showcase && weak) drop("weak");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, showcase, weak]);

  const handleRef = useRef<{ update: (u: typeof uniforms) => void } | null>(null);

  useEffect(() => {
    const element = host.current;
    const surface = canvas.current;
    if (!render || still || weak || !element || !surface) {
      setLive(false);
      return;
    }
    let cancelled = false;
    let stop: (() => void) | undefined;
    const cancelStart = afterFirstPaint(() => {
      // The engine and the scene's own GLSL load together, each in its own chunk
      void Promise.all([import("../motion/webgl"), import("../motion/shaders")])
        .then(async ([engine, programs]) => {
          const fragment = await programs.loadShaderProgram(render.program);
          if (cancelled) return;
          if (!fragment) {
            setDropped(true);
            drop("unavailable");
            return;
          }
          const handle = engine.startShader({
            canvas: surface,
            host: element,
            // The scene sits behind the page, so pointer moves are read on the document
            pointerArea: entry?.pointer === "fine" ? document.body : null,
            fragment,
            uniforms,
            speed: shaderSpeed(values),
            dprCap: engine.dprCapFor(device),
            alpha: true,
            onSlow: () => {
              setDropped(true);
              drop("slow");
            },
            onFirstFrame: () => {
              if (!cancelled) setLive(true);
            },
          });
          if (!handle) {
            setDropped(true);
            drop("unavailable");
            return;
          }
          handleRef.current = handle;
          stop = handle.stop;
        })
        .catch(() => {
          setDropped(true);
          drop("unavailable");
        });
    });
    return () => {
      cancelled = true;
      cancelStart();
      stop?.();
      handleRef.current = null;
      setLive(false);
    };
    // Uniforms update in place below; a new shader or speed restarts the engine
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, still, weak, device, values["speed"]]);

  useEffect(() => {
    handleRef.current?.update(uniforms);
  }, [uniforms]);

  if (!render) return null;
  return (
    <div
      ref={host}
      aria-hidden
      data-effect={entry?.id}
      data-state={live ? "live" : "poster"}
      className={cn("pointer-events-none", className)}
      style={{ background: poster }}
    >
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: live ? 1 : 0, transition: `opacity ${MOTION.room}ms ${PRISM_EASE}` }}
      />
    </div>
  );
}
