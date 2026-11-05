"use client";

import type { PointerEvent } from "react";
import { hoverStrengthFactor, type EffectEntry, type ParamValues } from "@repo/constants";

/**
 * Theme Engine v2 phase 3e (spec 3.5, board 09): the hovers and the press
 * that move the button itself. CreatorButton wires them only while the
 * themeShowcase flag is on and motion is allowed. None of them delays the
 * click.
 * - Magnet follows the pointer: up to 8 px toward it and 2 deg of turn at
 *   the default Strength, then settles back in 377 ms.
 * - Jelly plays its keyframes once as the pointer enters or focus arrives.
 * - Jelly press plays its keyframes on the button at pointerdown.
 */

const SETTLE_MS = 377;
const EASE = "cubic-bezier(0.2,0,0,1)";

function reduced(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** The Magnet transform for a pointer at (x, y) over a box; offsets are -1 to 1 of the half size. */
export function magnetTransform(
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
  params: ParamValues = {}
): string {
  const f = hoverStrengthFactor(params);
  const dx = Math.max(-1, Math.min(1, (x - (box.left + box.width / 2)) / (box.width / 2 || 1)));
  const dy = Math.max(-1, Math.min(1, (y - (box.top + box.height / 2)) / (box.height / 2 || 1)));
  const round = (value: number) => Number(value.toFixed(2));
  return `translate(${round(dx * 8 * f)}px, ${round(dy * 8 * f)}px) rotate(${round(dx * 2 * f)}deg)`;
}

export interface HoverHandlers {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: { currentTarget: HTMLElement }) => void;
}

/**
 * The Magnet's pending frame and settle animation, kept on the element instead
 * of in the handler closure: CreatorButton rebuilds the handlers on every
 * render, so a frame or animation started by an earlier render would otherwise
 * survive a leave and write a stale transform, and a running settle (WAAPI
 * outranks inline style) would keep the button from following the pointer.
 * A WeakMap holds no reference to a removed button.
 */
interface HoverState {
  frame: number;
  settle?: Animation;
}

const HOVER_STATE = new WeakMap<HTMLElement, HoverState>();

function hoverState(node: HTMLElement): HoverState {
  let state = HOVER_STATE.get(node);
  if (!state) {
    state = { frame: 0 };
    HOVER_STATE.set(node, state);
  }
  return state;
}

/** Stops a pending frame and a running settle, so the pointer leads again. */
function stopHover(node: HTMLElement): HoverState {
  const state = hoverState(node);
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0;
  state.settle?.cancel();
  state.settle = undefined;
  return state;
}

/** Pointer handlers for a JS hover (Magnet, Jelly), or none for a class hover. */
export function hoverHandlers(entry: EffectEntry, params: ParamValues = {}): HoverHandlers {
  if (entry.render.kind !== "waapi" || entry.render.trigger !== "hover") return {};
  if (entry.id === "buttonHover.magnet") {
    return {
      onPointerEnter: event => {
        // A settle still playing would hold the button still for its 377 ms
        stopHover(event.currentTarget);
      },
      onPointerMove: event => {
        if (event.pointerType === "touch" || reduced()) return;
        const node = event.currentTarget;
        const { clientX, clientY } = event;
        const state = stopHover(node);
        state.frame = requestAnimationFrame(() => {
          state.frame = 0;
          node.style.transform = magnetTransform(
            node.getBoundingClientRect(),
            clientX,
            clientY,
            params
          );
        });
      },
      onPointerLeave: event => {
        const node = event.currentTarget;
        stopHover(node);
        const from = node.style.transform;
        node.style.transform = "";
        if (from && typeof node.animate === "function" && !reduced()) {
          const state = hoverState(node);
          const settle = node.animate([{ transform: from }, { transform: "none" }], {
            duration: SETTLE_MS,
            easing: EASE,
          });
          state.settle = settle;
          settle.onfinish = () => {
            if (state.settle === settle) state.settle = undefined;
          };
        }
      },
    };
  }
  const render = entry.render;
  const play = (node: HTMLElement) => {
    if (typeof node.animate !== "function" || reduced()) return;
    node.animate(
      render.keyframes(params, NO_COLORS) as Keyframe[],
      render.options(params) as KeyframeAnimationOptions
    );
  };
  return {
    onPointerEnter: event => {
      if (event.pointerType !== "touch") play(event.currentTarget);
    },
    onFocus: event => play(event.currentTarget),
  };
}

// The hovers that move the button read no colors
const NO_COLORS = { button: "", buttonText: "", container: "", text: "" };

/** Jelly press: the button's own keyframes at pointerdown. True when it played. */
export function playSelfPress(entry: EffectEntry, node: HTMLElement): boolean {
  if (entry.render.kind !== "waapi" || entry.render.target !== "self") return false;
  if (typeof node.animate !== "function" || reduced()) return false;
  node.animate(
    entry.render.keyframes({}, NO_COLORS) as Keyframe[],
    entry.render.options({}) as KeyframeAnimationOptions
  );
  return true;
}
