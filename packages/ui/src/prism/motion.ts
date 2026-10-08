"use client";

import { useEffect, useLayoutEffect, type RefObject } from "react";
import { flushSync } from "react-dom";
import { prismMotion, prismStagger } from "./motion-tokens.js";

/**
 * Prism motion for script (Build Board #26, spec docs/features/motion-layer.md).
 * Every value comes from motion-tokens.js, the same source as the Tailwind
 * preset classes. No animation library: View Transitions, Web Animations and
 * Prism CSS only. No bounce, overshoot or spring.
 */

const ms = (value: string) => Number.parseFloat(value);

/** Durations in milliseconds (Prism section 14). */
export const MOTION = {
  micro: ms(prismMotion.micro),
  hover: ms(prismMotion.hover),
  control: ms(prismMotion.control),
  panel: ms(prismMotion.panel),
  room: ms(prismMotion.room),
  stagger: ms(prismStagger),
} as const;

/** The one Prism easing. */
export const PRISM_EASE = prismMotion.easing;

const REDUCE = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCE).matches
  );
}

/** Motion may play: the visitor did not ask for reduced motion and the tab is visible. */
export function motionAllowed(): boolean {
  if (typeof document === "undefined") return false;
  return !prefersReducedMotion() && document.visibilityState === "visible";
}

export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ------------------------------------------------------------------------- */
/* View Transitions                                                          */
/* ------------------------------------------------------------------------- */

/**
 * room: destination change (610 ms room crossfade, the top bar title morphs).
 * list: rows added, removed or moved (233 ms, rows slide into place).
 * A tab change inside a destination needs no transition: the selected lens
 * glides and the new tab content fades in (Prism Tabs).
 */
export type PrismTransitionKind = "room" | "list";

type ViewTransitionLike = { finished: Promise<void>; ready: Promise<void> };
type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionLike;
};

/**
 * Elements that carry a transition name while a transition runs: shell parts
 * (main, the top bar title) for a destination change, rows for list changes.
 */
const NAME_ATTR = "data-prism-vt-name";
const ROW_ATTR = "data-prism-vt-row";

function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as DocumentWithTransitions).startViewTransition === "function"
  );
}

function rendered(element: HTMLElement) {
  return element.getClientRects().length > 0;
}

// Names go on only for the length of a transition. A permanent
// view-transition-name makes its element a backdrop root, which would stop
// Prism glass inside it from blurring the room behind.
function applyNames(attr: string, used: Set<string>, named: HTMLElement[]) {
  document.querySelectorAll<HTMLElement>(`[${attr}]`).forEach(element => {
    const name = element.getAttribute(attr);
    // A hidden twin (desktop and phone title) or a repeated name would abort the transition
    if (!name || used.has(name) || !rendered(element)) return;
    used.add(name);
    element.style.setProperty("view-transition-name", name);
    named.push(element);
  });
}

let running = 0;

/**
 * Run a DOM update inside a View Transition. Falls back to a plain update when
 * the browser has no View Transitions, under reduced motion, or in a hidden tab.
 */
export function viewTransition(
  update: () => void | Promise<void>,
  kind: PrismTransitionKind
): Promise<void> {
  if (!supportsViewTransitions() || !motionAllowed()) {
    return Promise.resolve(update()).then(() => undefined);
  }
  const root = document.documentElement;
  const attr = kind === "list" ? ROW_ATTR : NAME_ATTR;
  const named: HTMLElement[] = [];
  applyNames(attr, new Set(), named);
  root.dataset.prismVt = kind;
  running += 1;

  const transition = (document as DocumentWithTransitions).startViewTransition!(async () => {
    await update();
    // Elements that mounted with the new state join under their names
    const used = new Set(
      named.map(element => element.style.getPropertyValue("view-transition-name"))
    );
    applyNames(attr, used, named);
  });

  const cleanup = () => {
    running -= 1;
    named.forEach(element => element.style.removeProperty("view-transition-name"));
    if (running === 0) delete root.dataset.prismVt;
  };
  // A skipped or aborted transition still applied the update
  transition.ready.catch(() => undefined);
  return transition.finished.then(cleanup, cleanup);
}

let commitResolver: (() => void) | null = null;

// React commits navigation asynchronously (BrowserRouter uses a transition),
// so the update callback waits until the shell calls markTransitionCommitted
// from a layout effect, or 400 ms at most.
function untilCommitted(update: () => void, kind: "room"): void {
  if (!supportsViewTransitions() || !motionAllowed()) {
    update();
    return;
  }
  void viewTransition(
    () =>
      new Promise<void>(resolve => {
        commitResolver?.();
        commitResolver = resolve;
        update();
        setTimeout(resolve, 400);
      }),
    kind
  );
}

/** Destination change: the 610 ms room, the top bar title morphs. */
export function roomTransition(update: () => void): void {
  untilCommitted(update, "room");
}

/** Call from a layout effect once the new destination has rendered. */
export function markTransitionCommitted(): void {
  const resolve = commitResolver;
  commitResolver = null;
  resolve?.();
}

/**
 * Rows added, removed or moved by a button (block list, Undo). Each row needs
 * data-prism-vt-row with a name unique on the page (see transitionName). Drag
 * reorder keeps its own animation.
 */
export function listTransition(update: () => void): void {
  void viewTransition(() => flushSync(update), "list");
}

/** A transition name safe as a CSS ident, for data-prism-vt-row. */
export function transitionName(prefix: string, key: string | number): string {
  return `${prefix}-${String(key).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/* ------------------------------------------------------------------------- */
/* Web Animations helpers                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Draw a stroke from nothing to full. The element needs pathLength="1" and
 * stroke-dasharray="1", and rests drawn (dashoffset 0) so the end state shows
 * with no script and under reduced motion.
 */
export function drawStroke(
  element: SVGElement | null,
  options: { duration: number; delay?: number }
): Animation | null {
  if (!element || typeof element.animate !== "function" || !motionAllowed()) return null;
  return element.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: options.duration,
    delay: options.delay ?? 0,
    easing: PRISM_EASE,
    fill: "backwards",
  });
}

/** One pulse: grow and fade, then rest (a pending dot, a new badge). */
export function pulseOnce(element: Element | null): void {
  if (!element || typeof element.animate !== "function" || !motionAllowed()) return;
  element.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.8)", opacity: 0.5, offset: 0.4 },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: MOTION.room, easing: PRISM_EASE }
  );
}

/**
 * Pause an element's CSS loop while it is off screen (data-offscreen), so idle
 * loops cost nothing when nobody sees them.
 */
export function useOffscreenPause(ref: RefObject<Element | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) element.removeAttribute("data-offscreen");
      else element.setAttribute("data-offscreen", "");
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}
