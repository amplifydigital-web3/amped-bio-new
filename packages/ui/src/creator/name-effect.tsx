"use client";

import { useRef } from "react";
import type { EffectEntry, ThemeColors } from "@repo/constants";
import { motionAllowed, useIsomorphicLayoutEffect } from "../prism/motion";

/**
 * Theme Engine v2 phase 2, Name row (board 08, spec 3.5): the text entrances
 * Blur in, Split reveal, Typewriter and Decrypt. Each plays once when the name
 * mounts, in 610 ms or less, and never hides the name: the server renders the
 * finished text, screen readers read the plain name, and Pause motion,
 * reduced motion or a repeat visit show the name as it ends.
 *
 * With entranceKey set (the public page passes the handle), an entrance plays
 * once per visit (sessionStorage amped.entrance.<key>). The editor passes no
 * key, so a pick replays it.
 */

const ENTRANCE_MS = 610;
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?";

/** Splits text into graphemes, so emoji and accents stay whole. */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
      s => s.segment
    );
  }
  return Array.from(text);
}

/** The delay between letters: the entry's stagger, squeezed so the last letter lands by 610 ms. */
export function letterStagger(stagger: number, duration: number, letters: number): number {
  if (letters <= 1) return 0;
  return Math.max(0, Math.min(stagger, (ENTRANCE_MS - duration) / (letters - 1)));
}

/** True when the entrance should play now; records the play for a keyed visit. */
export function entranceShouldPlay(paused: boolean, entranceKey?: string): boolean {
  if (paused || !motionAllowed()) return false;
  if (!entranceKey) return true;
  const key = `amped.entrance.${entranceKey}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: play, as a first visit would
  }
  return true;
}

/** The scrambled frame: letters before `resolved` show the text, the rest random glyphs. */
export function scrambleFrame(letters: string[], resolved: number, random = Math.random): string {
  return letters
    .map((letter, i) =>
      i < resolved || letter.trim() === ""
        ? letter
        : (GLYPHS[Math.floor(random() * GLYPHS.length)] ?? letter)
    )
    .join("");
}

export interface NameTextProps {
  entry: EffectEntry;
  text: string;
  colors: ThemeColors;
  paused?: boolean;
  entranceKey?: string;
}

/** The name's text, with the entry's entrance when it has one. */
export function NameText({ entry, text, colors, paused = false, entranceKey }: NameTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const render = entry.render;
  const mode = render.kind === "waapi" ? render.text : undefined;

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || render.kind !== "waapi" || !mode) return;
    if (!entranceShouldPlay(paused, entranceKey)) return;
    const params = {};

    if (mode === "scramble") {
      const letters = graphemes(text);
      const duration = Number(render.options(params).duration) || ENTRANCE_MS;
      const start = performance.now();
      let frame = 0;
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        node.textContent =
          progress >= 1 ? text : scrambleFrame(letters, Math.floor(progress * letters.length));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      node.textContent = scrambleFrame(letters, 0);
      frame = requestAnimationFrame(tick);
      return () => {
        cancelAnimationFrame(frame);
        node.textContent = text;
      };
    }

    if (typeof node.animate !== "function") return;
    const keyframes = render.keyframes(params, colors) as Keyframe[];
    const options = render.options(params) as KeyframeAnimationOptions;
    const targets =
      mode === "letters" ? Array.from(node.querySelectorAll<HTMLElement>("[data-letter]")) : [node];
    const step = letterStagger(render.stagger ?? 0, Number(options.duration) || 0, targets.length);
    const animations = targets.map((target, i) =>
      target.animate(keyframes, { ...options, delay: i * step })
    );
    return () => animations.forEach(animation => animation.cancel());
    // entry.id replays the entrance when the creator picks another one
  }, [entry.id, text, paused, entranceKey]);

  if (!mode) return <>{text}</>;

  if (mode === "letters") {
    const words = text.split(/(\s+)/);
    return (
      <>
        <span className="sr-only">{text}</span>
        <span ref={ref} aria-hidden>
          {words.map((word, w) =>
            /^\s+$/.test(word) || word === "" ? (
              word
            ) : (
              <span key={w} className="inline-block whitespace-nowrap">
                {graphemes(word).map((letter, i) => (
                  <span key={i} data-letter className="inline-block">
                    {letter}
                  </span>
                ))}
              </span>
            )
          )}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden>
        {text}
      </span>
    </>
  );
}
