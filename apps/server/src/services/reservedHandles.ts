import {
  handleKey,
  matchReservedIn,
  seedAdminRows,
  type AdminReservedRow,
  type ReservedMatch,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { getRedisClient } from "../utils/cache";

/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md 4.1).
 *
 * The system tier lives in @repo/constants. The admin tier is the
 * `reserved_handles` table (RH2), held in a process cache:
 * - every admin write bumps `reserved_handles:version` in Redis and reloads
 *   the writing instance at once;
 * - other instances read the version at most every 5 s and reload on change;
 * - every instance reloads from the database every 60 s whatever Redis says;
 *   while Redis is unreachable it reads the table every 5 s instead, so an
 *   outage adds no staleness (the table is small and indexed).
 * Before the first load succeeds the seed list stands in, so the company and
 * trust words are never open.
 */
export const RESERVED_VERSION_KEY = "reserved_handles:version";
const VERSION_POLL_MS = 5_000;
const FULL_RELOAD_MS = 60_000;

type Cache = {
  rows: AdminReservedRow[];
  version: string | null;
  loadedAt: number;
  polledAt: number;
};

let cache: Cache | null = null;
let loading: Promise<AdminReservedRow[]> | null = null;

async function readVersion(): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return (await redis.get(RESERVED_VERSION_KEY)) ?? "0";
  } catch {
    return null;
  }
}

/** Reads every admin tier row. Expired rows are kept; the matcher skips them. */
async function queryAdminRows(): Promise<AdminReservedRow[]> {
  const rows = await prisma.reservedHandle.findMany({
    select: {
      id: true,
      word: true,
      kind: true,
      category: true,
      expiresAt: true,
      assignedUserId: true,
    },
  });
  return rows.map(row => ({ ...row, id: Buffer.from(row.id).toString("hex") }));
}

async function reload(version: string | null): Promise<AdminReservedRow[]> {
  const now = Date.now();
  try {
    const rows = await queryAdminRows();
    cache = { rows, version, loadedAt: now, polledAt: now };
    return rows;
  } catch (error) {
    console.error("[reserved-handles] admin tier load failed, keeping the last list", error);
    const rows = cache?.rows ?? seedAdminRows();
    // Try the database again after one poll interval, not on every call
    cache = {
      rows,
      version: cache?.version ?? null,
      loadedAt: now - FULL_RELOAD_MS + VERSION_POLL_MS,
      polledAt: now,
    };
    return rows;
  }
}

async function loadAdminRows(): Promise<AdminReservedRow[]> {
  const now = Date.now();
  if (cache && now - cache.polledAt < VERSION_POLL_MS && now - cache.loadedAt < FULL_RELOAD_MS) {
    return cache.rows;
  }
  if (loading) return loading;
  loading = (async () => {
    const version = await readVersion();
    if (
      cache &&
      now - cache.loadedAt < FULL_RELOAD_MS &&
      version !== null &&
      version === cache.version
    ) {
      cache.polledAt = now;
      return cache.rows;
    }
    return reload(version);
  })().finally(() => {
    loading = null;
  });
  return loading;
}

/**
 * Call after every committed admin tier write: other instances see the new
 * version within 5 s, and this instance reloads now.
 */
export async function bumpReservedVersion(): Promise<void> {
  const redis = getRedisClient();
  let version: string | null = null;
  if (redis) {
    try {
      version = String(await redis.incr(RESERVED_VERSION_KEY));
    } catch {
      version = null;
    }
  }
  await reload(version);
}

/** Test hook: forget the cache. */
export function resetReservedCache(): void {
  cache = null;
  loading = null;
}

/** Matches a handle against both tiers. */
export async function matchReserved(handle: string): Promise<ReservedMatch> {
  return matchReservedIn(handle, await loadAdminRows());
}

/** The admin tier rows the generators strip prefixes from. */
export async function reservedRowsForGenerators(): Promise<AdminReservedRow[]> {
  return loadAdminRows();
}

/**
 * True when `userId` may hold `handle` although it matches an admin tier row:
 * the word is assigned to it, or an admin exempted it (a `HandleNotice` in
 * state EXEMPT for that word whose old handle is this handle). System words
 * never pass.
 */
export async function holderMayKeep(
  match: ReservedMatch,
  userId: number | undefined,
  handle: string
): Promise<boolean> {
  if (!match.reserved || match.tier === "system" || userId === undefined) return false;
  if (match.assignedUserId === userId) return true;
  const exempt = await prisma.handleNotice.findFirst({
    where: {
      userId,
      reservedWord: match.word,
      state: "EXEMPT",
      oldHandle: handleKey(handle),
    },
    select: { id: true },
  });
  return exempt !== null;
}
