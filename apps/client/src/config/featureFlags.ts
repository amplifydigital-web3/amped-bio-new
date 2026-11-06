import {
  FEATURE_FLAGS,
  PUBLIC_FEATURE_FLAG_KEYS,
  isFeatureFlagKey,
  resolveFeatureFlag,
  type FeatureFlagKey,
  type FeatureFlagOverrides,
} from "@repo/constants";

/**
 * Feature flags from site_settings (packages/constants/src/feature-flags.ts).
 * main.tsx awaits loadFeatureFlags() before it imports the app, so module
 * level reads such as `const X = isFeatureOn("rns")` already see the admin's
 * rows. A change in the admin shows on the next page load, with no rebuild.
 * A flag without a row falls back to this build's VITE_ variable.
 */

const CACHE_KEY = "amped_feature_flags";
const LOAD_TIMEOUT_MS = 2_000;

let overrides: FeatureFlagOverrides = {};

function clientEnvValue(key: FeatureFlagKey): string | undefined {
  const name = (FEATURE_FLAGS[key].env as { client?: string }).client;
  if (!name) return undefined;
  return (import.meta.env as Record<string, string | undefined>)[name];
}

/** The flag in this app: the admin's row, else this build's VITE_ variable, else the default */
export function isFeatureOn(key: FeatureFlagKey): boolean {
  return resolveFeatureFlag(key, overrides, clientEnvValue(key));
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

function readCache(): FeatureFlagOverrides {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? parseFeatureFlagOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function writeCache(value: FeatureFlagOverrides) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the next load asks the API again
  }
}

/**
 * Read the rows from public.getFeatureFlags. When the API is slow or
 * down, the last rows this browser saw are used, else the build's variables.
 */
export async function loadFeatureFlags(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/trpc/public.getFeatureFlags`,
      { signal: controller.signal, credentials: "include" }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { result?: { data?: unknown } };
    overrides = parseFeatureFlagOverrides(body.result?.data);
    writeCache(overrides);
  } catch (error) {
    console.warn("[feature flags] using the last known values", error);
    overrides = readCache();
  } finally {
    clearTimeout(timeout);
  }
}

/** Tests only: replace the rows */
export function setFeatureFlagOverridesForTests(next: FeatureFlagOverrides) {
  overrides = { ...next };
}
