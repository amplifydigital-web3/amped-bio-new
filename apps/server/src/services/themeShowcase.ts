import { findEffect, type ThemeConfig } from "@repo/constants";
import { isFeatureOn } from "./featureFlags";

/**
 * Theme Engine v2 phase 3b (docs/features/theme-engine-v2.md, 3.5): a shader
 * scene is stored only while the themeShowcase flag is on. Off, a theme write
 * keeps every other field and drops a WebGL particlesEffectId with its params,
 * so hiding the tiles is not the only guard (AGENTS.md, feature flags rule 3).
 */
export function guardThemeShowcase<T extends ThemeConfig | undefined>(config: T): T {
  if (!config?.particlesEffectId || isFeatureOn("themeShowcase")) return config;
  if (findEffect(config.particlesEffectId)?.engine !== "webgl") return config;
  const { particlesEffectId: _id, particlesParams: _params, ...rest } = config;
  return rest as T;
}
