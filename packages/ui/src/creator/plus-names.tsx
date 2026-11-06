"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  NAME_SPEED_FACTOR,
  ROTATING_WORDS_MS,
  rotatingWords,
  type EffectEntry,
  type ParamValues,
} from "@repo/constants";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import { lowPower } from "../motion/watchdog";
import { useShowcase } from "./showcase-context";

/**
 * Theme Engine v2 phase 3e (spec 3.5, board 08): the Plus and Showcase name
 * effects. Each keeps the plain name in the heading for screen readers and
 * search. Without the themeShowcase flag the page shows that plain name.
 */

/** True when a pointer effect may follow the pointer: a mouse or pen, no reduced motion. */
function finePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;
}

/**
 * Rotating words: a second line under the name swaps through the creator's
 * words every 2.6 s (Speed scales it). Settle once plays one pass and rests
 * on the first word; Pause motion, reduced motion and a weak device show the
 * first word still.
 */
export function RotatingWords({
  text,
  params,
  paused = false,
  loop = false,
}: {
  text: string;
  params?: ParamValues;
  paused?: boolean;
  /** Keep cycling (Settle: Loop). Off, one pass then the first word. */
  loop?: boolean;
}) {
  const { showcase, device } = useShowcase();
  const reducedMotion = usePrefersReducedMotion();
  const words = rotatingWords(params?.["words"]);
  const [index, setIndex] = useState(0);
  const line = useRef<HTMLSpanElement>(null);
  const weak = device === "weak" || (device === undefined && lowPower());
  const run = showcase && !paused && !reducedMotion && !weak && words.length > 1;
  const factor = NAME_SPEED_FACTOR[String(params?.["speed"])] ?? 1;
  const interval = Math.round(ROTATING_WORDS_MS * factor);
  const wordsKey = words.join(",");

  useEffect(() => {
    setIndex(0);
    if (!run) return;
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += 1;
      // One pass: every word once, then back to the first, then rest
      if (!loop && shown > words.length) {
        window.clearInterval(timer);
        return;
      }
      setIndex(shown % words.length);
    }, interval);
    return () => window.clearInterval(timer);
    // wordsKey stands for words
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, loop, interval, wordsKey]);

  useEffect(() => {
    const node = line.current;
    if (!run || !node || index === 0 || typeof node.animate !== "function") return;
    node.animate(
      [
        { opacity: 0, transform: "translateY(0.5em)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 377, easing: "cubic-bezier(0.2,0,0,1)", fill: "both" }
    );
  }, [index, run]);

  if (!showcase || words.length === 0) return <>{text}</>;
  return (
    <>
      {text}
      <span className="sr-only">, {words.join(", ")}</span>
      <span
        aria-hidden
        data-effect="name.rotating-words"
        className="block overflow-hidden text-[0.62em] font-semibold leading-[1.5]"
      >
        <span ref={line} className="inline-block">
          {words[index] ?? words[0]}
        </span>
      </span>
    </>
  );
}

/** The circle the name sits on, as a share of the photo size. */
const RING_GAP = 21;

/**
 * Circular: the name set on a circle around the photo. Still. The font comes
 * from the heading around it; a name too long for the circle is squeezed to
 * fit. size is the photo's width in px.
 */
export function CircularName({
  text,
  size,
  className,
  style,
}: {
  text: string;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const box = size + RING_GAP * 2 + 18;
  const r = size / 2 + RING_GAP / 2 + 6;
  const c = box / 2;
  const fontSize = size >= 120 ? 17 : 13;
  const circumference = 2 * Math.PI * r;
  // About 0.62 em a letter plus the 0.12 em tracking; squeeze past 90 percent of the circle
  const estimate = text.length * fontSize * 0.74;
  const fit = estimate > circumference * 0.9 ? circumference * 0.9 : undefined;
  return (
    <svg
      aria-hidden
      data-effect="name.circular"
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      className={className}
      style={{ overflow: "visible", ...style }}
    >
      <defs>
        {/* Starts at the bottom and runs clockwise, so 50 percent is the top */}
        <path
          id={`amped-ring-${id}`}
          d={`M ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r}`}
        />
      </defs>
      <text
        fill="currentColor"
        fontSize={fontSize}
        fontWeight={700}
        letterSpacing="0.12em"
        textAnchor="middle"
        {...(fit ? { textLength: fit, lengthAdjust: "spacingAndGlyphs" } : {})}
      >
        <textPath href={`#amped-ring-${id}`} startOffset="50%">
          {text}
        </textPath>
      </text>
    </svg>
  );
}

/** How far each shadow layer moves at most, back to front (spec 3.5: up to 8 px). */
const DEPTH_LAYERS = [8, 4] as const;

/**
 * Depth parallax: two layers in tints of the text color sit behind the name
 * and follow the pointer, up to 8 px. At rest, and on phones, under reduced
 * motion or Pause motion, the layers hold a still offset that reads as depth.
 */
export function DepthName({ entry, text }: { entry: EffectEntry; text: string }) {
  const { showcase, paused, device } = useShowcase();
  const reducedMotion = usePrefersReducedMotion();
  const host = useRef<HTMLSpanElement>(null);
  const layers = useRef<(HTMLSpanElement | null)[]>([]);
  const weak = device === "weak" || (device === undefined && lowPower());
  const run = showcase && !paused && !reducedMotion && !weak;

  useEffect(() => {
    const node = host.current;
    if (!run || !node || !finePointer()) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const draw = () => {
      frame = 0;
      layers.current.forEach((layer, i) => {
        const reach = DEPTH_LAYERS[i] ?? 0;
        if (layer) layer.style.transform = `translate(${x * reach}px, ${y * reach}px)`;
      });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = node.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      // Away from the pointer, so the name seems to float above the layers
      x = Math.max(-1, Math.min(1, (cx - event.clientX) / (window.innerWidth / 2)));
      y = Math.max(-1, Math.min(1, (cy - event.clientY) / (window.innerHeight / 2)));
      if (!frame) frame = requestAnimationFrame(draw);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
      layers.current.forEach(layer => layer && (layer.style.transform = ""));
    };
  }, [run]);

  if (!showcase) return <>{text}</>;
  return (
    <span ref={host} className="relative inline-block" data-effect={entry.id}>
      {DEPTH_LAYERS.map((reach, i) => (
        <span
          key={reach}
          ref={el => {
            layers.current[i] = el;
          }}
          aria-hidden
          className="pointer-events-none absolute inset-0 select-none transition-transform duration-[89ms] ease-linear"
          style={{
            color: `color-mix(in srgb, currentColor ${i === 0 ? 22 : 40}%, transparent)`,
            translate: `${(i + 1) * 1.5}px ${(i + 1) * 1.5}px`,
          }}
        >
          {text}
        </span>
      ))}
      <span className="relative">{text}</span>
    </span>
  );
}
