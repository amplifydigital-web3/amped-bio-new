import type { CanvasEffectFactory } from "../canvas";

// Theme Engine v2 phase 3c (spec 3.6): the canvas entries, each in its own
// chunk, loaded with the engine after first paint. The registry names a
// module by key (render.module); an unknown key keeps the still version.

const MODULES: Readonly<Record<string, () => Promise<CanvasEffectFactory>>> = {
  glow: () => import("./follow").then(m => m.glow),
  ring: () => import("./follow").then(m => m.ring),
  "spark-trail": () => import("./trails").then(m => m.sparkTrail),
  "pixel-trail": () => import("./trails").then(m => m.pixelTrail),
  "dot-trail": () => import("./trails").then(m => m.dotTrail),
  splash: () => import("./splash").then(m => m.splash),
  "click-spark": () => import("./click-spark").then(m => m.clickSpark),
};

export const CANVAS_MODULE_KEYS = Object.keys(MODULES);

export async function loadCanvasEffect(key: string): Promise<CanvasEffectFactory | null> {
  const load = MODULES[key];
  return load ? load() : null;
}
