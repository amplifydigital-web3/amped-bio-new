import {
  findFont,
  weightPulseParams,
  weightPulseRange,
  type FontCatalogEntry,
  type ThemeConfig,
} from "@repo/constants";
import { currentNameFont } from "./fontLook";

// Theme Engine v2 TE-3e2 (spec 3.5, board 08): Weight pulse needs a variable
// name font with a wght axis. The editor writes Lightest and Boldest inside
// the family's axis, so the page asks Google for a range the family has.

export const WEIGHT_PULSE_ID = "name.weight-pulse";

/** The catalog entry of the name face, when the catalog has it. */
export function nameFontEntry(
  families: readonly FontCatalogEntry[] | null,
  config: ThemeConfig,
  fontFamily: string
): FontCatalogEntry | undefined {
  return families ? findFont(families, currentNameFont(config, fontFamily).family) : undefined;
}

/** True when the name face can pulse. */
export function canPulse(entry: FontCatalogEntry | undefined): boolean {
  return weightPulseRange(entry) !== null;
}

/** The patch the Weight pulse tile writes, or null when the name face has no weight axis. */
export function weightPulsePatch(entry: FontCatalogEntry | undefined): Partial<ThemeConfig> | null {
  const params = weightPulseParams(entry);
  if (!params) return null;
  return { heroEffect: 0, heroEffectId: WEIGHT_PULSE_ID, heroEffectParams: params };
}

/** Lightest and Boldest kept inside the name face's axis while the creator drags them. */
export function clampPulseParams(
  entry: FontCatalogEntry | undefined,
  params: Record<string, number | string>
): Record<string, number | string> {
  return weightPulseParams(entry, params) ?? params;
}

/**
 * When the name face changes under Weight pulse: refit the range to the new
 * family, or drop the effect when the family has no weight axis.
 */
export function pulseRefit(
  config: ThemeConfig,
  next: FontCatalogEntry | undefined
): Partial<ThemeConfig> {
  if (config.heroEffectId !== WEIGHT_PULSE_ID) return {};
  const params = weightPulseParams(next, config.heroEffectParams ?? {});
  return params
    ? { heroEffectParams: params }
    : { heroEffect: 0, heroEffectId: undefined, heroEffectParams: undefined };
}
