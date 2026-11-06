"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  ENTRANCE_MS,
  attentionOf,
  type AnyThemeConfig,
  type AttentionPreset,
} from "@repo/constants";
import { cn } from "../utils";
import { lookFor } from "../creator/look";
import { prefersReducedMotion } from "../prism/motion";
import { usePrefersReducedMotion } from "../use-reduced-motion";
import {
  ATTENTION_START,
  attentionStep,
  parseStoredPlays,
  type AttentionClock,
} from "./attention-schedule";
import { motionOf, playAttention, playEntrance } from "./block-motion";

// Block Review v2 B0 (Build Board #54): the frame every rendered block sits in
// on the creator page and in the editor preview. It runs two motion slots from
// the block's settings (spec "Block settings row", Motion):
//
// 1. Entrance. Once per visit per block, when the block first comes into
//    view. Rise, Fade or Scale, 377 ms. "Theme default" plays Rise until the
//    theme registry carries an entrance. Nothing hides the block before
//    script runs, and the block rests visible whatever happens.
// 2. Attention. When the block comes into view, then every 8 seconds, 3 plays
//    per visit (BS3). A play due out of view waits until the block is back.
//
// Both are off under prefers-reduced-motion and the page's Pause motion. The
// attention count still runs then, so analytics stay comparable.

export type BlockFrameMode = "public" | "preview";

export type AttentionPlayEvent = {
  blockId: number | string;
  preset: AttentionPreset;
  /** 1 to 3 */
  play: number;
  /** False when motion was off and nothing moved */
  animated: boolean;
};

export interface BlockFrameProps {
  /** The block: its id and its config (schedule, attention, motion) */
  block: { id: number | string; config?: unknown };
  theme: AnyThemeConfig | null | undefined;
  /** The page's Pause motion control */
  paused?: boolean;
  /** The page handle: the entrance and the attention plays count once per visit */
  entranceKey?: string;
  /** "preview" (editor): no storage; a changed setting replays so the creator sees it */
  mode?: BlockFrameMode;
  /** Analytics: block_attention_played */
  onAttentionPlay?: (event: AttentionPlayEvent) => void;
  className?: string;
  children?: ReactNode;
}

function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting still applies for this page view
  }
}

export function BlockFrame({
  block,
  theme,
  paused = false,
  entranceKey,
  mode = "public",
  onAttentionPlay,
  className,
  children,
}: BlockFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const motion = motionOf(block);
  const preset = attentionOf(block);
  const colors = lookFor(theme).colors;

  // The latest props, read by observers and timers
  const live = useRef({ motion, preset, colors, paused, mode, entranceKey, onAttentionPlay });
  live.current = { motion, preset, colors, paused, mode, entranceKey, onAttentionPlay };

  const inView = useRef(false);
  const entered = useRef(false);
  const clock = useRef<AttentionClock>(ATTENTION_START);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Animation[]>([]);
  const tickRef = useRef<() => void>(() => undefined);

  const storageKey = (slot: "entrance" | "attention") =>
    mode === "public" && entranceKey ? `amped.block-${slot}.${entranceKey}.${block.id}` : null;

  const motionOff = () => live.current.paused || prefersReducedMotion();

  const stopAnimations = () => {
    for (const animation of running.current) {
      try {
        animation.cancel();
      } catch {
        // Already gone
      }
    }
    running.current = [];
  };

  const enter = (short: boolean) => {
    const frame = frameRef.current;
    if (!frame) return;
    const { motion: setting } = live.current;
    if (!setting.entrance || motionOff()) return;
    const animation = playEntrance(frame, setting.style, short);
    if (animation) running.current.push(animation);
  };

  // One attention tick: play when due, then wait for the next one
  const tick = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const frame = frameRef.current;
    const current = live.current;
    if (!frame || current.preset === "off") return;
    const visible =
      inView.current && (typeof document === "undefined" || document.visibilityState !== "hidden");
    const step = attentionStep(clock.current, Date.now(), visible, ENTRANCE_MS);
    clock.current = step.clock;
    if (step.play) {
      const key = storageKey("attention");
      if (key) writeStorage(key, String(step.clock.plays));
      const animated = !motionOff();
      if (animated) running.current.push(...playAttention(current.preset, frame, current.colors));
      current.onAttentionPlay?.({
        blockId: block.id,
        preset: current.preset,
        play: step.clock.plays,
        animated,
      });
    }
    if (step.wait !== null) timer.current = setTimeout(() => tickRef.current(), step.wait);
  };
  tickRef.current = tick;

  // Watch the block come into view: the entrance once, attention every time
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const attentionKey = storageKey("attention");
    if (attentionKey) clock.current = { plays: parseStoredPlays(readStorage(attentionKey)), dueAt: null };

    let first = true;
    const onView = (visible: boolean) => {
      inView.current = visible;
      if (visible && !entered.current) {
        entered.current = true;
        const key = storageKey("entrance");
        if (!key || !readStorage(key)) {
          if (key) writeStorage(key, "1");
          // A block already in view on load plays the short entrance
          enter(first);
        }
      }
      first = false;
      tickRef.current();
    };

    const onVisibility = () => tickRef.current();
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      onView(true);
    } else {
      observer = new IntersectionObserver(
        entries => {
          const entry = entries[entries.length - 1];
          if (entry) onView(entry.isIntersecting);
        },
        { threshold: 0.2 }
      );
      observer.observe(frame);
    }
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
      stopAnimations();
    };
    // Mounted once per block; the latest props are read through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause motion or reduced motion stops anything playing at once
  useEffect(() => {
    if (paused || reduced) stopAnimations();
  }, [paused, reduced]);

  // Editor preview: a changed Motion setting replays the entrance
  const motionSetting = `${motion.entrance}:${motion.style}`;
  const lastMotion = useRef(motionSetting);
  useEffect(() => {
    if (lastMotion.current === motionSetting) return;
    lastMotion.current = motionSetting;
    if (mode !== "preview") return;
    stopAnimations();
    enter(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSetting, mode]);

  // A changed preset starts its plays; the editor starts a fresh count to show it
  const lastPreset = useRef(preset);
  useEffect(() => {
    if (lastPreset.current === preset) return;
    lastPreset.current = preset;
    if (mode === "preview") {
      stopAnimations();
      clock.current = { plays: 0, dueAt: Date.now() };
    }
    tickRef.current();
  }, [preset, mode]);

  return (
    <div
      ref={frameRef}
      data-block-frame=""
      // empty:hidden: a block that renders nothing adds no gap to the list
      className={cn("relative empty:hidden", className)}
    >
      {children}
    </div>
  );
}
