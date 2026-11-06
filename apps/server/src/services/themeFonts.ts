import { withoutCatalogFonts, type ThemeConfig } from "@repo/constants";
import { isFeatureOn } from "./featureFlags";

/**
 * Theme Engine v2 fonts (docs/features/theme-engine-v2.md, 3.8): the catalog
 * faces are stored only while the fontCatalog flag is on. Off, a theme write
 * keeps every other field and drops nameFont and bodyFontStyle, so hiding the
 * picker is not the only guard (AGENTS.md, feature flags rule 3).
 */
export function guardThemeFonts<T extends ThemeConfig | undefined>(config: T): T {
  if (!config || isFeatureOn("fontCatalog")) return config;
  return withoutCatalogFonts(config) as T;
}
