"use client";

import type { ThemeColors } from "@repo/constants";
import type { CanvasHandle } from "../motion/canvas";

/**
 * Theme Engine v2 phase 3c: Click spark draws on one shared canvas over the
 * page (pointer-events none), created on the first press and kept asleep
 * between presses. The press never waits for it: the link opens as usual.
 */

let overlay: Promise<CanvasHandle | null> | null = null;
let colorKey = "";

function create(colors: ThemeColors): Promise<CanvasHandle | null> {
  return Promise.all([import("../motion/canvas"), import("../motion/canvas-effects")]).then(
    async ([engine, effects]) => {
      const factory = await effects.loadCanvasEffect("click-spark");
      if (!factory) return null;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.effect = "buttonPress.click-spark";
      Object.assign(canvas.style, {
        position: "fixed",
        inset: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: "40",
      });
      document.body.appendChild(canvas);
      const handle = engine.startCanvas({
        canvas,
        host: canvas,
        effect: factory({}, colors),
        dprCap: 1.5,
        onSlow: () => {
          canvas.remove();
          overlay = null;
        },
      });
      if (!handle) canvas.remove();
      return handle;
    }
  );
}

/** Plays Click spark at the press point. */
export function playSpark(clientX: number, clientY: number, colors: ThemeColors) {
  const key = colors.button;
  if (!overlay || key !== colorKey) {
    void overlay?.then(handle => handle?.stop());
    document
      .querySelectorAll('canvas[data-effect="buttonPress.click-spark"]')
      .forEach(c => c.remove());
    colorKey = key;
    overlay = create(colors).catch(() => null);
  }
  void overlay.then(handle => handle?.press(clientX, clientY));
}
