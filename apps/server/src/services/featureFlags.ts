import { prisma } from "@repo/database";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_SETTING_PREFIX,
  PUBLIC_FEATURE_FLAG_KEYS,
  featureFlagSettingKey,
  isFeatureFlagKey,
  resolveFeatureFlag,
  type FeatureFlagKey,
  type FeatureFlagOverrides,
} from "@repo/constants";
import { env } from "../env";

/**
 * Feature flags from site_settings (packages/constants/src/feature-flags.ts).
 * The rows are held in memory so `isFeatureOn` stays synchronous wherever
 * `env.X_ENABLED` was read before. Every instance reloads them every
 * REFRESH_MS, and the instance that saves a change applies it at once.
 */

export const FEATURE_FLAG_REFRESH_MS = 15_000;

let overrides: FeatureFlagOverrides = {};
let timer: NodeJS.Timeout | null = null;

function serverEnvValue(key: FeatureFlagKey): boolean | undefined {
  const name = (FEATURE_FLAGS[key].env as { server?: string }).server;
  if (!name) return undefined;
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "boolean" ? value : undefined;
}

/** The flag on this API: the admin's row, else the server environment variable, else the default */
export function isFeatureOn(key: FeatureFlagKey): boolean {
  return resolveFeatureFlag(key, overrides, serverEnvValue(key));
}

/**
 * Rows an admin set for public flags. The apps resolve a missing key from their
 * own environment. A public flag with only a server variable (accessGating)
 * sends the API's value, so the apps never show what the API refuses.
 */
export function publicFeatureFlagOverrides(): FeatureFlagOverrides {
  const out: FeatureFlagOverrides = {};
  for (const key of PUBLIC_FEATURE_FLAG_KEYS) {
    const value = overrides[key];
    if (value !== undefined) out[key] = value;
    else if (!hasAppEnv(key)) out[key] = isFeatureOn(key);
  }
  return out;
}

function hasAppEnv(key: FeatureFlagKey): boolean {
  const names = FEATURE_FLAGS[key].env as { client?: string; landing?: string };
  return Boolean(names.client || names.landing);
}

/** Reload every row. Keeps the last good rows when the database does not answer. */
export async function refreshFeatureFlags(): Promise<void> {
  try {
    const rows = await prisma.siteSettings.findMany({
      where: { setting_key: { startsWith: FEATURE_FLAG_SETTING_PREFIX } },
    });
    const next: FeatureFlagOverrides = {};
    for (const row of rows) {
      const key = row.setting_key.slice(FEATURE_FLAG_SETTING_PREFIX.length);
      if (!isFeatureFlagKey(key)) continue;
      if (row.setting_value === "true") next[key] = true;
      else if (row.setting_value === "false") next[key] = false;
    }
    overrides = next;
  } catch (error) {
    console.error("[feature flags] reload failed, keeping the last values", error);
  }
}

/** Load once, then reload every REFRESH_MS. Called from bootstrap.ts. */
export async function startFeatureFlagRefresh(): Promise<void> {
  if (timer) return;
  await refreshFeatureFlags();
  timer = setInterval(() => void refreshFeatureFlags(), FEATURE_FLAG_REFRESH_MS);
  timer.unref?.();
}

export interface FeatureFlagView {
  key: FeatureFlagKey;
  label: string;
  description: string;
  scope: "public" | "server";
  /** The admin's row, or null when the apps fall back to their environment */
  override: boolean | null;
  /** The value on this API, or null for a flag the API does not read */
  serverValue: boolean | null;
  env: { server?: string; client?: string; landing?: string };
  default: boolean;
}

/** Every flag for the admin page, read fresh from the database */
export async function listFeatureFlags(): Promise<FeatureFlagView[]> {
  await refreshFeatureFlags();
  return FEATURE_FLAG_KEYS.map(key => {
    const def = FEATURE_FLAGS[key];
    const flagEnv = def.env as FeatureFlagView["env"];
    return {
      key,
      label: def.label,
      description: def.description,
      scope: def.scope,
      override: overrides[key] ?? null,
      serverValue: flagEnv.server ? isFeatureOn(key) : null,
      env: flagEnv,
      default: def.default,
    };
  });
}

/** Set a flag, or clear its row with null so every app falls back to its environment again */
export async function setFeatureFlag(
  key: FeatureFlagKey,
  value: boolean | null,
  adminUserId: number
): Promise<void> {
  const settingKey = featureFlagSettingKey(key);
  if (value === null) {
    await prisma.siteSettings.deleteMany({ where: { setting_key: settingKey } });
  } else {
    await prisma.siteSettings.upsert({
      where: { setting_key: settingKey },
      create: { setting_key: settingKey, setting_value: String(value), value_type: "BOOLEAN" },
      update: { setting_value: String(value), value_type: "BOOLEAN" },
    });
  }
  const next = { ...overrides };
  if (value === null) delete next[key];
  else next[key] = value;
  overrides = next;
  console.info(
    `[feature flags] admin ${adminUserId} set ${key} to ${value === null ? "environment default" : value}`
  );
}

/** Tests only: replace the in-memory rows */
export function __setFeatureFlagOverridesForTests(next: FeatureFlagOverrides) {
  overrides = { ...next };
}
