"use client";

import { useEffect, useRef, useState } from "react";
import { clampParams, type EffectEntry, type ParamValues } from "@repo/constants";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { lowPower } from "../motion/watchdog";
import { useShowcase } from "./showcase-context";

/**
 * Theme Engine v2 phase 3c (spec 3.5): Fuzzy text. The name stays in the h1,
 * so screen readers read it and visitors can select it. Once the canvas draws
 * its first frame the ink goes transparent and the canvas shows the name with
 * shimmering edges; until then, and whenever the canvas cannot run (no
 * showcase flag, Pause motion, reduced motion, a weak device, a name that
 * wraps), the plain name shows.
 */

const PAD = 12;

/**
 * The canvas font shorthand for the name: the element's computed style, with
 * the creator's family when the caller knows it. The canvas rasterizes once,
 * so the effect also re-runs when this changes (a Text row font pick).
 */
export function fuzzyFont(
  style: { fontStyle: string; fontWeight: string; fontSize: string; fontFamily: string },
  family?: string
): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${family || style.fontFamily}`;
}

export function FuzzyName({
  entry,
  text,
  params,
  fontFamily,
}: {
  entry: EffectEntry;
  text: string;
  params?: ParamValues;
  /** The creator's family, so a font change re-rasterizes the canvas. */
  fontFamily?: string;
}) {
  const { showcase, paused, device } = useShowcase();
  const reducedMotion = usePrefersReducedMotion();
  const span = useRef<HTMLSpanElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const weak = device === "weak" || (device === undefined && lowPower());
  const run = showcase && !paused && !reducedMotion && !weak;

  useEffect(() => {
    const node = span.current;
    const box = host.current;
    const surface = canvas.current;
    if (!run || !node || !box || !surface) {
      setLive(false);
      return;
    }
    const style = getComputedStyle(node);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
    // A name that wraps keeps the plain heading
    if (node.getBoundingClientRect().height > lineHeight * 1.5) return;
    const values = clampParams(entry, params);
    const font = fuzzyFont(style, fontFamily);
    // The canvas rasterizes the text once, so wait for the webfont: drawing the
    // fallback face would leave the heading in another font for the page's life
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const fontsReady: Promise<unknown> = fonts?.load?.(font) ?? fonts?.ready ?? Promise.resolve();
    let cancelled = false;
    let stop: (() => void) | undefined;
    void Promise.all([
      import("../motion/canvas"),
      import("../motion/canvas-effects/fuzzy"),
      fontsReady,
    ])
      .then(([engine, fuzzy]) => {
        if (cancelled) return;
        const rect = box.getBoundingClientRect();
        const probe = document.createElement("canvas").getContext("2d");
        if (probe) probe.font = font;
        const metrics = probe?.measureText(text);
        const ascent = metrics?.actualBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.8;
        const descent = metrics?.actualBoundingBoxDescent ?? parseFloat(style.fontSize) * 0.2;
        const dpr = Math.min(device === "strong" ? 2 : 1.5, window.devicePixelRatio || 1);
        const fuzz = fuzzy.createFuzzy(
          {
            text,
            font,
            color: style.color,
            strength: Number(values["strength"]) || 0,
            speed: Number(values["speed"]) || 0,
            width: rect.width - PAD * 2,
            height: rect.height,
            x: 0,
            ascent,
            descent,
            align: "left",
          },
          dpr
        );
        const handle = engine.startCanvas({
          canvas: surface,
          host: box,
          continuous: true,
          dprCap: dpr,
          effect: {
            resize: (width, height) => fuzz.resize(width, height),
            frame: ({ ctx, time }) => {
              ctx.save();
              ctx.setTransform(1, 0, 0, 1, 0, 0);
              fuzz.draw(ctx, time);
              ctx.restore();
              return true;
            },
          },
          onSlow: () => setLive(false),
          onFirstFrame: () => !cancelled && setLive(true),
        });
        stop = handle?.stop;
      })
      .catch(() => setLive(false));
    return () => {
      cancelled = true;
      stop?.();
      setLive(false);
    };
  }, [run, text, entry, params, device, fontFamily]);

  return (
    <span className="relative inline-block">
      <span
        ref={span}
        style={live ? { WebkitTextFillColor: "transparent" } : undefined}
        data-effect={entry.id}
        data-state={live ? "live" : "plain"}
      >
        {text}
      </span>
      <span
        ref={host}
        aria-hidden
        className="pointer-events-none absolute inset-y-0"
        style={{ left: -PAD, right: -PAD }}
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      </span>
    </span>
  );
}
