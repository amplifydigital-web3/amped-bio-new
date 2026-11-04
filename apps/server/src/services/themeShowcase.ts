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
 * - a canvas buttonPressId (TE-3c Click spark).
 * Hiding the tiles is not the only guard (AGENTS.md, feature flags rule 3).
 */

const SHOWCASE_ENGINES = new Set(["webgl", "canvas"]);

function showcaseOnly(id: string | undefined): boolean {
  const engine = id ? findEffect(id)?.engine : undefined;
  return engine !== undefined && SHOWCASE_ENGINES.has(engine);
}

export function guardThemeShowcase<T extends ThemeConfig | undefined>(config: T): T {
  if (!config || isFeatureOn("themeShowcase")) return config;
  const drops: (keyof ThemeConfig)[] = [];
  if (showcaseOnly(config.particlesEffectId)) drops.push("particlesEffectId", "particlesParams");
  if (config.cursorEffectId !== undefined || config.cursorParams !== undefined) {
    drops.push("cursorEffectId", "cursorParams");
  }
  if (showcaseOnly(config.heroEffectId)) drops.push("heroEffectId", "heroEffectParams");
  if (showcaseOnly(config.buttonPressId)) drops.push("buttonPressId");
  if (drops.length === 0) return config;
  const rest = { ...config } as Record<string, unknown>;
  for (const key of drops) delete rest[key];
  return rest as T;
}
