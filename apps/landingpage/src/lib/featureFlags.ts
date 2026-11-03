import {
  PUBLIC_FEATURE_FLAG_KEYS,
  isFeatureFlagKey,
  resolveFeatureFlag,
  type FeatureFlagKey,
  type FeatureFlagOverrides,
} from "@repo/constants";

/**
 * Feature flags from site_settings (packages/constants/src/feature-flags.ts).
 * The root layout reads the admin's rows on the server and hands them to
 * FeatureFlagsProvider, so a change shows within REVALIDATE_SECONDS (and a
 * page's own revalidate) with no rebuild. A flag without a row falls back to
 * this build's NEXT_PUBLIC_ variable.
 */

const REVALIDATE_SECONDS = 30;
const LOAD_TIMEOUT_MS = 2_000;

// Written out so Next inlines each NEXT_PUBLIC_ value in client bundles
const LANDING_ENV: Partial<Record<FeatureFlagKey, string | undefined>> = {
  rns: process.env.NEXT_PUBLIC_SHOW_RNS,
  themeV2: process.env.NEXT_PUBLIC_SHOW_THEME_V2,
  motion: process.env.NEXT_PUBLIC_SHOW_MOTION,
  fanGraph: process.env.NEXT_PUBLIC_FAN_GRAPH,
  messages: process.env.NEXT_PUBLIC_MESSAGES,
};

/** The flag on the public site: the admin's row, else this build's NEXT_PUBLIC_ variable, else the default */
export function resolveLandingFlag(key: FeatureFlagKey, overrides: FeatureFlagOverrides): boolean {
  return resolveFeatureFlag(key, overrides, LANDING_ENV[key]);
}

/** Keeps only known public keys with boolean values */
export function parseFeatureFlagOverrides(value: unknown): FeatureFlagOverrides {
  const out: FeatureFlagOverrides = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, flag] of Object.entries(value as Record<string, unknown>)) {
    if (
      isFeatureFlagKey(key) &&
      PUBLIC_FEATURE_FLAG_KEYS.includes(key) &&
      typeof flag === "boolean"
    ) {
      out[key] = flag;
    }
  }
  return out;
}

/** Server only: the admin's rows, or none when the API does not answer (every flag uses its variable) */
export async function getFeatureFlagOverrides(): Promise<FeatureFlagOverrides> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? ""}/trpc/publicSettings.getFeatureFlags`,
      {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
      }
    );
    if (!response.ok) return {};
    const body = (await response.json()) as { result?: { data?: unknown } };
    return parseFeatureFlagOverrides(body.result?.data);
  } catch {
    return {};
  }
}
