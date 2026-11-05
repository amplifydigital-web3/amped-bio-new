// The shared 2D canvas engine (Theme Engine v2 spec 3.6, phase 3c, PR TE-3c).
// No library. Runs the canvas entries: cursor glow, ring and trails, Splash,
// Click spark and Fuzzy text. Same rules as the WebGL engine (webgl.ts):
// - the pixel ratio is capped per device (2 strong, 1.5 typical, 1 weak);
// - drawing pauses while the host is off screen or the tab is hidden;
// - the shared frame watchdog (median over 28 ms in the first 45 drawn frames)
//   stops the loop and calls onSlow, and the caller keeps its still version.
// An effect's frame() returns false when nothing is left to draw (a trail
// that faded out); the loop then sleeps until the next pointer move or press,
// so an idle page spends no frames.

import type { ParamValues, ThemeColors } from "@repo/constants";
import { createFrameWatchdog } from "./watchdog";

export interface CanvasPointer {
  /** CSS px inside the host */
  x: number;
  y: number;
  /** True after the first move inside the host, false once it leaves */
  inside: boolean;
}

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** CSS px */
  width: number;
  height: number;
  /** Seconds since start */
  time: number;
  /** Seconds since the last drawn frame, capped at 0.05 */
  dt: number;
  pointer: CanvasPointer;
}

export interface CanvasEffect {
  /** Draws one frame. Return false when there is nothing left to draw. */
  frame: (frame: CanvasFrame) => boolean;
  /** A press at x, y in CSS px inside the host (Click spark). */
  press?: (x: number, y: number) => void;
  /** The host changed size (CSS px). */
  resize?: (width: number, height: number) => void;
}

export interface CanvasEffectFactory {
  (params: ParamValues, colors: ThemeColors): CanvasEffect;
}

export interface CanvasOptions {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  effect: CanvasEffect;
  /** Pointer moves are read here, in host coordinates. Omit for no pointer. */
  pointerArea?: HTMLElement | Document | null;
  dprCap?: number;
  /** Run every frame, even when frame() returns false (Fuzzy text). */
  continuous?: boolean;
  onSlow: () => void;
  onFirstFrame?: () => void;
}

export interface CanvasHandle {
  press: (clientX: number, clientY: number) => void;
  stop: () => void;
}

/** Starts a 2D canvas effect. Returns null when the browser has no 2D context. */
export function startCanvas(options: CanvasOptions): CanvasHandle | null {
  const { canvas, host, effect, pointerArea, onSlow, onFirstFrame } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = Math.min(options.dprCap ?? 1.5, window.devicePixelRatio || 1);
  let width = 1;
  let height = 1;
  const size = () => {
    const box = host.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    effect.resize?.(width, height);
  };
  size();

  const pointer: CanvasPointer = { x: width / 2, y: height / 2, inside: false };
  const start = performance.now();
  let last = 0;
  let raf = 0;
  let visible = true;
  let stopped = false;
  let drew = false;

  const watchdog = createFrameWatchdog({
    onSlow: () => {
      stop();
      onSlow();
    },
  });

  const frame = (now: number) => {
    raf = 0;
    if (stopped) return;
    if (!visible || document.hidden) {
      watchdog.pause();
      last = 0;
      return;
    }
    if (!watchdog.sample(now)) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    ctx.clearRect(0, 0, width, height);
    const busy = effect.frame({ ctx, width, height, time: (now - start) / 1000, dt, pointer });
    if (!drew) {
      drew = true;
      onFirstFrame?.();
    }
    if (busy || options.continuous) raf = requestAnimationFrame(frame);
    else {
      // Asleep: the next move or press wakes the loop, and the gap is not measured
      watchdog.pause();
      last = 0;
    }
  };
  const wake = () => {
    if (!stopped && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const local = (clientX: number, clientY: number) => {
    const box = host.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top, box };
  };
  const move = (event: Event) => {
    const { clientX, clientY } = event as PointerEvent;
    const { x, y, box } = local(clientX, clientY);
    pointer.x = x;
    pointer.y = y;
    pointer.inside = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
    wake();
  };
  const leave = () => {
    pointer.inside = false;
    wake();
  };

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          wake();
        });
  observer?.observe(host);
  pointerArea?.addEventListener("pointermove", move, { passive: true });
  pointerArea?.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("resize", size);
  wake();

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    pointerArea?.removeEventListener("pointermove", move);
    pointerArea?.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", wake);
    window.removeEventListener("resize", size);
    ctx?.clearRect(0, 0, width, height);
  }

  return {
    press(clientX, clientY) {
      if (stopped || !effect.press) return;
      const { x, y } = local(clientX, clientY);
      effect.press(x, y);
      wake();
    },
    stop,
  };
}

/** "#5650A2" and an alpha to an rgba() string. Falls back to black. */
export function rgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = match ? parseInt(match[1]!, 16) : 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** The color a canvas entry paints with: a custom color when picked, else the theme color. */
export function effectColor(params: ParamValues, fallback: string): string {
  const custom = params["color"];
  return params["palette"] === "custom" &&
    typeof custom === "string" &&
    /^#[0-9a-f]{6}$/i.test(custom)
    ? custom
    : fallback;
}
