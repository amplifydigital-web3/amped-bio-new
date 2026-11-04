import { prisma } from "@repo/database";
import { SITE_SETTINGS, STAKE_ACCESS_RULE_KINDS } from "@repo/constants";
import { TRPCError } from "@trpc/server";
import { env } from "../../env";

/** Shown wherever a creator outside the pilot picks a stake rule (content gating 3.5, OB-Q65). */
export const STAKE_NOT_ALLOWED_MESSAGE = "Not available for your page yet.";

/**
 * The stake pilot allowlist (spec 6, flags): creator user ids, comma separated. The
 * site_settings row wins, so an admin changes it with no redeploy. With no row, the
 * ACCESS_STAKE_KINDS_ALLOWLIST environment value is the fallback. An empty row means nobody.
 *
 * Like the feature flags (services/featureFlags.ts), the value is held in memory for
 * STAKE_KINDS_ALLOWLIST_CACHE_MS, so a page of checks does not read the row once per rule.
 * Every instance reloads it after that window, and the instance that saves a change
 * applies it at once. A database error is never cached: it throws, and check() refuses.
 */
export const STAKE_KINDS_ALLOWLIST_CACHE_MS = 15_000;

export type StakeKindsAllowlistSource = { value: string; source: "setting" | "environment" };

let stakeAllowlistCache: { entry: StakeKindsAllowlistSource; loadedAt: number } | null = null;

/** The list and where it comes from. `fresh` skips the in-memory copy (admin reads). */
export async function readStakeKindsAllowlist(
  opts: { fresh?: boolean } = {}
): Promise<StakeKindsAllowlistSource> {
  const now = Date.now();
  if (
    !opts.fresh &&
    stakeAllowlistCache &&
    now - stakeAllowlistCache.loadedAt < STAKE_KINDS_ALLOWLIST_CACHE_MS
  ) {
    return stakeAllowlistCache.entry;
  }
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: SITE_SETTINGS.ACCESS_STAKE_KINDS_ALLOWLIST },
  });
  const entry: StakeKindsAllowlistSource = row
    ? { value: row.setting_value, source: "setting" }
    : { value: env.ACCESS_STAKE_KINDS_ALLOWLIST, source: "environment" };
  stakeAllowlistCache = { entry, loadedAt: now };
  return entry;
}

export async function stakeKindsAllowlist(): Promise<string> {
  return (await readStakeKindsAllowlist()).value;
}

/** "3, 10,x,11" to [3, 10, 11]: positive safe integer ids only, in list order */
export function parseStakeKindsAllowlist(list: string): number[] {
  return list
    .split(",")
    .map(value => value.trim())
    .filter(value => /^\d+$/.test(value))
    .map(Number)
    .filter(id => Number.isSafeInteger(id) && id > 0);
}

/**
 * Save the creator ids, or pass null to drop the row so the environment value applies
 * again. This instance applies it at once; the others within the cache window.
 */
export async function setStakeKindsAllowlist(
  userIds: number[] | null,
  adminUserId: number
): Promise<StakeKindsAllowlistSource> {
  const key = SITE_SETTINGS.ACCESS_STAKE_KINDS_ALLOWLIST;
  let entry: StakeKindsAllowlistSource;
  if (userIds === null) {
    await prisma.siteSettings.deleteMany({ where: { setting_key: key } });
    entry = { value: env.ACCESS_STAKE_KINDS_ALLOWLIST, source: "environment" };
  } else {
    const value = [...new Set(userIds)].sort((a, b) => a - b).join(",");
    await prisma.siteSettings.upsert({
      where: { setting_key: key },
      create: { setting_key: key, setting_value: value, value_type: "STRING" },
      update: { setting_value: value, value_type: "STRING" },
    });
    entry = { value, source: "setting" };
  }
  stakeAllowlistCache = { entry, loadedAt: Date.now() };
  // Audit trail: who changed the pilot and to which creators
  console.info(
    `[access admin] admin ${adminUserId} set the stake allowlist to ${
      userIds === null ? "environment default" : `[${entry.value}]`
    }`
  );
  return entry;
}

/** Tests only: forget the in-memory copy */
export function __resetStakeKindsAllowlistCacheForTests() {
  stakeAllowlistCache = null;
}

/** Stake rules are live only for creators on the pilot allowlist (spec 6, flags). */
export async function stakeKindsAllowed(ownerUserId: number, allowlist?: string) {
  const list = allowlist ?? (await stakeKindsAllowlist());
  return list
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .includes(String(ownerUserId));
}

export const isStakeKind = (kind: string) =>
  (STAKE_ACCESS_RULE_KINDS as readonly string[]).includes(kind);

/** FORBIDDEN when any kind reads a stake and the owner is outside the allowlist. */
export async function assertStakeKindsAllowed(ownerUserId: number, kinds: readonly string[]) {
  if (kinds.some(isStakeKind) && !(await stakeKindsAllowed(ownerUserId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: STAKE_NOT_ALLOWED_MESSAGE });
  }
}
