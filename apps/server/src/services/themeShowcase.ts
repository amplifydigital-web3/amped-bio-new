import { findEffect, type ThemeConfig } from "@repo/constants";
import { isFeatureOn } from "./featureFlags";

/**
 * Theme Engine v2 phase 3 (docs/features/theme-engine-v2.md, 3.5 and 3.6):
 * picks that run on the showcase engines (WebGL and the 2D canvas) are stored
 * only while the themeShowcase flag is on. Off, a theme write keeps every
 * other field and drops:
 * - a WebGL particlesEffectId with its params (TE-3b shader scenes);
 * - cursorEffectId with its params (TE-3c Cursor row);
 * - a canvas heroEffectId with its params (TE-3c Fuzzy text);
 * - a canvas buttonPressId (TE-3c Click spark);
 * - a Plus or Showcase buttonEffectId, heroEffectId or buttonPressId with its
 *   params (TE-3e Magnet, Lift and tilt, Jelly, Jelly press, Rotating words,
 *   Circular, Depth parallax); buttonEffect keeps the v1 look beside it;
 * - Strength on a core hover's params (TE-3e).
 * Hiding the tiles is not the only guard (AGENTS.md, feature flags rule 3).
 */

const SHOWCASE_ENGINES = new Set(["webgl", "canvas"]);

function showcaseOnly(id: string | undefined): boolean {
  const engine = id ? findEffect(id)?.engine : undefined;
  return engine !== undefined && SHOWCASE_ENGINES.has(engine);
}

/** TE-3e: hover, press and name picks above the core tier need the flag. */
function plusOnly(id: string | undefined): boolean {
  const tier = id ? findEffect(id)?.tier : undefined;
  return tier !== undefined && tier !== "core";
}

export function guardThemeShowcase<T extends ThemeConfig | undefined>(config: T): T {
  if (!config || isFeatureOn("themeShowcase")) return config;
  const drops: (keyof ThemeConfig)[] = [];
  if (showcaseOnly(config.particlesEffectId)) drops.push("particlesEffectId", "particlesParams");
  if (config.cursorEffectId !== undefined || config.cursorParams !== undefined) {
    drops.push("cursorEffectId", "cursorParams");
  }
  if (showcaseOnly(config.heroEffectId) || plusOnly(config.heroEffectId)) {
    drops.push("heroEffectId", "heroEffectParams");
  }
  if (showcaseOnly(config.buttonPressId) || plusOnly(config.buttonPressId)) {
    drops.push("buttonPressId");
  }
  const plusHover = plusOnly(config.buttonEffectId);
  if (plusHover) drops.push("buttonEffectId", "buttonEffectParams");
  const strength = !plusHover && config.buttonEffectParams?.["strength"] !== undefined;
  if (drops.length === 0 && !strength) return config;
  const rest = { ...config } as Record<string, unknown>;
  for (const key of drops) delete rest[key];
  if (strength) {
    const { strength: _strength, ...params } = config.buttonEffectParams ?? {};
    rest["buttonEffectParams"] = Object.keys(params).length > 0 ? params : undefined;
    if (rest["buttonEffectParams"] === undefined) delete rest["buttonEffectParams"];
  }
  return rest as T;
}
