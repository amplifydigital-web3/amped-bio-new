/**
 * Content takedown, edge sync (Build Board #20 and #28, PR C7a). Spec:
 * docs/features/content-takedown.md, sections 4.1 to 4.6.
 *
 * Every item has one edge state, derived from its fields and its creator, never
 * set by hand:
 *
 *   OPEN      public: no KV key, normal Stream origins
 *   PRIVATE   not public, not blocked: `private:{publicId}` (old public links stop)
 *   BLOCKED   deleted, moderation blocked, creator suspended or Safety hidden:
 *             `blocked:{publicId}`, Stream origins closed (TD1)
 *
 * Callers never write KV. They set `edgeDirtyAt` in the same write that changes
 * the item (edgeDirty()), then call syncEdge() once after the commit so the common
 * case lands in the same request. startEdgeSync() retries anything left dirty
 * every minute with backoff, and once a day reconciles the stored state against
 * the computed one so a missed mark heals within a day.
 *
 * Nothing is marked synced that the edge has not accepted. Without the KV
 * settings, items stay dirty and the log carries `[content] ALERT edge sync not
 * configured`; delivery behaves as before C7a.
 */
import { prisma, type ContentEdgeState, type Prisma } from "@repo/database";
import { takedownBlockedKey, takedownPrivateKey, type TakedownReason } from "@repo/constants";
import { isPublicItem } from "./access";
import {
  deleteTakedownKey,
  deleteTakedownKeys,
  putTakedownKey,
  putTakedownKeys,
  takedownKvConfigured,
} from "../cloudflare/kv";
import { gatewayCacheUrl, purgeGatewayUrls } from "../cloudflare/cachePurge";
import { STREAM_CLOSED_ORIGINS, setStreamAllowedOrigins } from "../cloudflare/stream";
import { streamAllowedOrigins } from "../cloudflare/config";
import { env } from "../../env";

// ----------------------------------------------------------------------------
// Desired state (4.1)
// ----------------------------------------------------------------------------

/** Why Safety hid an item. Written by R1 to R3 through hideItems. */
export const HIDDEN_REASONS = ["safety", "child_safety", "take_it_down", "withdrawn"] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

export type EdgeTarget =
  | { state: "OPEN" }
  | { state: "PRIVATE" }
  | { state: "BLOCKED"; reason: TakedownReason };

export interface EdgeItem {
  status: string;
  publishState: string;
  moderationState: string;
  moderationReason?: string | null;
  accessRuleId: Uint8Array | null;
  adult: boolean;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  hiddenReason: string | null;
}

export interface EdgeCreator {
  page_status: string;
  block: string;
}

/** Moderation blocks from the CSAM matcher are child safety: no reviewer ever reveals them. */
function moderationReason(reason: string | null | undefined): TakedownReason {
  return reason && /^(csam|child)/i.test(reason) ? "child_safety" : "moderation";
}

/** The one place that decides an item's edge state. BLOCKED wins over PRIVATE. */
export function desiredEdgeState(item: EdgeItem, creator: EdgeCreator | null): EdgeTarget {
  if (item.hiddenAt && item.hiddenReason === "child_safety") {
    return { state: "BLOCKED", reason: "child_safety" };
  }
  if (item.status === "BLOCKED" || item.moderationState === "BLOCKED") {
    return { state: "BLOCKED", reason: moderationReason(item.moderationReason) };
  }
  if (item.hiddenAt) return { state: "BLOCKED", reason: "safety" };
  if (item.status === "DELETED" || item.deletedAt !== null) {
    return { state: "BLOCKED", reason: "deleted" };
  }
  if (!creator || creator.block !== "no") return { state: "BLOCKED", reason: "suspended" };
  return isPublicItem(
    {
      status: item.status as never,
      publishState: item.publishState as never,
      moderationState: item.moderationState as never,
      accessRuleId: item.accessRuleId as never,
      adult: item.adult,
      deletedAt: item.deletedAt,
      hiddenAt: item.hiddenAt,
    },
    creator
  )
    ? { state: "OPEN" }
    : { state: "PRIVATE" };
}

// ----------------------------------------------------------------------------
// Marks (4.3)
// ----------------------------------------------------------------------------

/** Spread into the data of any write that can move an item's edge state. */
export function edgeDirty(now: Date = new Date()): { edgeDirtyAt: Date } {
  return { edgeDirtyAt: now };
}

type ItemDb = Pick<typeof prisma, "contentItem">;

/** Marks every item of a creator: suspend, reinstate, page publish and unpublish. */
export async function markCreatorItemsDirty(userId: number, db: ItemDb = prisma): Promise<number> {
  const result = await db.contentItem.updateMany({ where: { userId }, data: edgeDirty() });
  return result.count;
}

// ----------------------------------------------------------------------------
// Applying (4.4, 4.5)
// ----------------------------------------------------------------------------

const SYNC_SELECT = {
  id: true,
  publicId: true,
  userId: true,
  status: true,
  publishState: true,
  moderationState: true,
  moderationReason: true,
  accessRuleId: true,
  adult: true,
  deletedAt: true,
  hiddenAt: true,
  hiddenReason: true,
  edgeState: true,
  edgeDirtyAt: true,
  edgeAttempts: true,
  updatedAt: true,
  user: { select: { page_status: true, block: true } },
  assets: { select: { role: true, storage: true, r2Key: true, streamUid: true } },
} satisfies Prisma.ContentItemSelect;

type SyncItem = Prisma.ContentItemGetPayload<{ select: typeof SYNC_SELECT }>;

/** Above this many items one pass uses the KV bulk endpoints (spec 4.3). */
export const EDGE_BULK_THRESHOLD = 20;
/** Items per loop pass, oldest mark first. */
export const EDGE_SYNC_BATCH = 500;
/** Purge reasons: the item is gone for good, so its cached bytes go too (4.5). */
const PURGE_REASONS: ReadonlySet<TakedownReason> = new Set([
  "deleted",
  "moderation",
  "child_safety",
]);

interface Plan {
  item: SyncItem;
  target: EdgeTarget;
  puts: Array<{ key: string; value: string }>;
  deletes: string[];
  /** Stream videos and clips to set, with the origin list */
  stream: { uids: string[]; origins: string[] } | null;
  purge: string[];
}

function streamUids(item: SyncItem): string[] {
  return [
    ...new Set(
      item.assets
        .filter(asset => asset.storage === "STREAM" && asset.streamUid)
        .map(asset => asset.streamUid as string)
    ),
  ];
}

function plan(item: SyncItem, target: EdgeTarget, now: Date): Plan | null {
  const at = now.toISOString();
  const blockedKey = takedownBlockedKey(item.publicId);
  const privateKey = takedownPrivateKey(item.publicId);
  const uids = streamUids(item);
  // A same state pass changes nothing, except BLOCKED, whose reason may have moved
  // (a Safety hide becoming child safety must close the reviewer reveal)
  if (target.state === item.edgeState && target.state !== "BLOCKED") return null;

  const result: Plan = { item, target, puts: [], deletes: [], stream: null, purge: [] };
  switch (target.state) {
    case "OPEN":
      result.deletes.push(blockedKey, privateKey);
      if (uids.length && item.edgeState === "BLOCKED") {
        result.stream = { uids, origins: streamAllowedOrigins() };
      }
      break;
    case "PRIVATE":
      result.puts.push({ key: privateKey, value: JSON.stringify({ at }) });
      result.deletes.push(blockedKey);
      if (uids.length && item.edgeState === "BLOCKED") {
        result.stream = { uids, origins: streamAllowedOrigins() };
      }
      break;
    case "BLOCKED":
      result.puts.push({ key: blockedKey, value: JSON.stringify({ r: target.reason, at }) });
      result.deletes.push(privateKey);
      if (uids.length) result.stream = { uids, origins: STREAM_CLOSED_ORIGINS };
      if (item.edgeState !== "BLOCKED" && PURGE_REASONS.has(target.reason)) {
        result.purge = item.assets
          .filter(asset => asset.storage === "R2" && asset.r2Key)
          .map(asset => gatewayCacheUrl(asset.r2Key as string));
      }
      break;
  }
  return result;
}

/** A short, value free description of a failure, never a token, key or URL. */
function shortError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 160);
}

/** Minutes to wait before attempt n + 1 after n failures: 1, 2, 5, 10, then 15. */
export function edgeBackoffMs(attempts: number): number {
  const minutes = [1, 2, 5, 10, 15][Math.min(Math.max(attempts, 1), 5) - 1]!;
  return minutes * 60_000;
}

async function recordSuccess(item: SyncItem, state: ContentEdgeState): Promise<void> {
  // Clear the mark only if nobody marked the item again while the edge was written
  const cleared = await prisma.contentItem.updateMany({
    where: { id: item.id, edgeDirtyAt: item.edgeDirtyAt },
    data: { edgeState: state, edgeDirtyAt: null, edgeAttempts: 0, edgeError: null },
  });
  if (cleared.count === 0) {
    // Another write marked the item again, or a newer sync cleared its own mark,
    // while this one was in flight. Record what the edge holds and mark it again,
    // so the latest desired state is applied on the next pass instead of waiting
    // for the daily reconcile
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { edgeState: state, edgeAttempts: 0, edgeError: null, ...edgeDirty() },
    });
  }
}

async function recordFailure(item: SyncItem, error: unknown): Promise<void> {
  await prisma.contentItem.update({
    where: { id: item.id },
    data: { edgeAttempts: { increment: 1 }, edgeError: shortError(error) },
  });
}

async function writeKv(plans: Plan[]): Promise<void> {
  const puts = plans.flatMap(p => p.puts);
  const deletes = plans.flatMap(p => p.deletes);
  if (plans.length > EDGE_BULK_THRESHOLD) {
    if (puts.length) await putTakedownKeys(puts);
    if (deletes.length) await deleteTakedownKeys(deletes);
    return;
  }
  for (const pair of puts) await putTakedownKey(pair.key, pair.value);
  for (const key of deletes) await deleteTakedownKey(key);
}

async function writeStream(entry: Plan): Promise<void> {
  if (!entry.stream) return;
  if (!env.CF_STREAM_API_TOKEN) throw new Error("Stream is not configured");
  for (const uid of entry.stream.uids) await setStreamAllowedOrigins(uid, entry.stream.origins);
}

export interface EdgeSyncResult {
  applied: number;
  unchanged: number;
  failed: number;
}

/**
 * Applies the desired state of the given loaded items. KV first (one bulk call
 * above 20 items), then Stream per item, then the cache purge, which never fails
 * the sync. Each item is recorded on its own so one bad video cannot hold back
 * the rest; a failed bulk write fails every item in it.
 */
async function applyItems(items: SyncItem[], now: Date): Promise<EdgeSyncResult> {
  const result: EdgeSyncResult = { applied: 0, unchanged: 0, failed: 0 };
  const plans: Plan[] = [];
  for (const item of items) {
    const target = desiredEdgeState(item, item.user);
    const entry = plan(item, target, now);
    if (entry) {
      plans.push(entry);
    } else {
      await recordSuccess(item, target.state);
      result.unchanged += 1;
    }
  }
  if (plans.length === 0) return result;

  try {
    await writeKv(plans);
  } catch (error) {
    for (const entry of plans) await recordFailure(entry.item, error);
    result.failed += plans.length;
    return result;
  }

  for (const entry of plans) {
    try {
      await writeStream(entry);
      await recordSuccess(entry.item, entry.target.state);
      result.applied += 1;
      if (entry.target.state === "BLOCKED") {
        console.info(
          "[content] content_blocked",
          JSON.stringify({ publicId: entry.item.publicId, reason: entry.target.reason })
        );
      }
      if (entry.purge.length) {
        // Cleanup only: a purge failure must never turn an applied state into a
        // failed attempt, which would show on the tile with nothing left to retry
        await purgeGatewayUrls(entry.purge).catch(() => 0);
      }
    } catch (error) {
      await recordFailure(entry.item, error);
      result.failed += 1;
    }
  }
  return result;
}

let notConfiguredLoggedAt = 0;

function logNotConfigured(now: number): void {
  if (now - notConfiguredLoggedAt < 60_000) return;
  notConfiguredLoggedAt = now;
  console.error("[content] ALERT edge sync not configured");
}

/**
 * Best effort apply for items a request just changed. Never throws: anything it
 * cannot finish stays dirty for the loop.
 */
export async function syncEdge(
  publicIds: string[],
  now: Date = new Date()
): Promise<EdgeSyncResult> {
  const empty = { applied: 0, unchanged: 0, failed: 0 };
  if (publicIds.length === 0) return empty;
  if (!takedownKvConfigured()) {
    logNotConfigured(now.getTime());
    return empty;
  }
  try {
    const items = await prisma.contentItem.findMany({
      where: { publicId: { in: [...new Set(publicIds)] }, edgeDirtyAt: { not: null } },
      select: SYNC_SELECT,
    });
    return await applyItems(items, now);
  } catch (error) {
    console.error("[content] edge sync failed", JSON.stringify({ error: shortError(error) }));
    return empty;
  }
}

/** Best effort apply for every dirty item of a creator (suspend, page unpublish). */
export async function syncCreatorEdge(userId: number, now: Date = new Date()): Promise<void> {
  if (!takedownKvConfigured()) {
    logNotConfigured(now.getTime());
    return;
  }
  try {
    for (;;) {
      const items = await prisma.contentItem.findMany({
        where: { userId, edgeDirtyAt: { not: null }, edgeAttempts: 0 },
        select: SYNC_SELECT,
        take: EDGE_SYNC_BATCH,
      });
      if (items.length === 0) return;
      const result = await applyItems(items, now);
      // A failing pass leaves the rest to the loop instead of spinning here
      if (result.failed > 0 || items.length < EDGE_SYNC_BATCH) return;
    }
  } catch (error) {
    console.error("[content] edge sync failed", JSON.stringify({ error: shortError(error) }));
  }
}

// ----------------------------------------------------------------------------
// Loop, reconcile, alerts (4.3)
// ----------------------------------------------------------------------------

/** Alert when an item waits this long, or this many items have failed 5 times. */
export const EDGE_ALERT_AGE_MS = 10 * 60_000;
export const EDGE_ALERT_FAILED_ITEMS = 10;
const RECONCILE_EVERY_MS = 24 * 60 * 60_000;
const RECONCILE_PAGE = 5000;

let lastRunAt: Date | null = null;
let lastReconcileAt = 0;

/** One pass of the loop: up to 500 dirty items, oldest first, honoring backoff. */
export async function runEdgeSync(now: Date = new Date()): Promise<EdgeSyncResult> {
  const empty = { applied: 0, unchanged: 0, failed: 0 };
  if (!takedownKvConfigured()) {
    logNotConfigured(now.getTime());
    return empty;
  }
  lastRunAt = now;
  const candidates = await prisma.contentItem.findMany({
    where: { edgeDirtyAt: { not: null } },
    orderBy: { edgeDirtyAt: "asc" },
    select: SYNC_SELECT,
    take: EDGE_SYNC_BATCH,
  });
  const due = candidates.filter(
    item =>
      item.edgeAttempts === 0 ||
      now.getTime() - item.updatedAt.getTime() >= edgeBackoffMs(item.edgeAttempts)
  );
  const result = await applyItems(due, now);
  await alertIfBehind(now);
  return result;
}

/** Marks every item whose stored edge state differs from the computed one. */
export async function reconcileEdge(now: Date = new Date()): Promise<number> {
  let marked = 0;
  let cursor: Uint8Array | undefined;
  for (;;) {
    const page = await prisma.contentItem.findMany({
      where: { edgeDirtyAt: null },
      orderBy: { id: "asc" },
      take: RECONCILE_PAGE,
      ...(cursor ? { cursor: { id: Buffer.from(cursor) }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        publishState: true,
        moderationState: true,
        moderationReason: true,
        accessRuleId: true,
        adult: true,
        deletedAt: true,
        hiddenAt: true,
        hiddenReason: true,
        edgeState: true,
        user: { select: { page_status: true, block: true } },
      },
    });
    if (page.length === 0) break;
    const drifted = page
      .filter(item => desiredEdgeState(item, item.user).state !== item.edgeState)
      .map(item => Buffer.from(item.id));
    if (drifted.length) {
      const result = await prisma.contentItem.updateMany({
        where: { id: { in: drifted } },
        data: edgeDirty(now),
      });
      marked += result.count;
    }
    if (page.length < RECONCILE_PAGE) break;
    cursor = page[page.length - 1]!.id;
  }
  if (marked > 0) console.warn("[content] edge reconcile", JSON.stringify({ marked }));
  return marked;
}

export interface EdgeHealth {
  state: "healthy" | "behind" | "not_configured";
  waiting: number;
  oldestWaitMs: number | null;
  failures: number;
  lastRunAt: string | null;
}

/** The admin Dashboard tile (board tk2). Counts only, never ids or keys. */
export async function edgeHealth(now: Date = new Date()): Promise<EdgeHealth> {
  const [waiting, oldest, failures] = await Promise.all([
    prisma.contentItem.count({ where: { edgeDirtyAt: { not: null } } }),
    prisma.contentItem.findFirst({
      where: { edgeDirtyAt: { not: null } },
      orderBy: { edgeDirtyAt: "asc" },
      select: { edgeDirtyAt: true },
    }),
    prisma.contentItem.count({ where: { edgeAttempts: { gte: 5 } } }),
  ]);
  const oldestWaitMs = oldest?.edgeDirtyAt ? now.getTime() - oldest.edgeDirtyAt.getTime() : null;
  const behind =
    (oldestWaitMs !== null && oldestWaitMs > EDGE_ALERT_AGE_MS) ||
    failures >= EDGE_ALERT_FAILED_ITEMS;
  return {
    state: !takedownKvConfigured() ? "not_configured" : behind ? "behind" : "healthy",
    waiting,
    oldestWaitMs,
    failures,
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
  };
}

async function alertIfBehind(now: Date): Promise<void> {
  const health = await edgeHealth(now);
  if (health.state === "behind") {
    console.error(
      "[content] ALERT edge sync behind",
      JSON.stringify({
        waiting: health.waiting,
        oldestWaitMs: health.oldestWaitMs,
        failures: health.failures,
      })
    );
  }
}

const LOOP_MS = 60_000;
let loop: NodeJS.Timeout | null = null;
let running = false;

/** Every 60 seconds; reconcile once a day. Skipped in tests. */
export function startEdgeSync(): void {
  if (loop || process.env.NODE_ENV === "test") return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = new Date();
      if (takedownKvConfigured() && now.getTime() - lastReconcileAt >= RECONCILE_EVERY_MS) {
        lastReconcileAt = now.getTime();
        await reconcileEdge(now);
      }
      const result = await runEdgeSync(now);
      if (result.applied > 0 || result.failed > 0) {
        console.info("[content] edge sync", JSON.stringify(result));
      }
    } catch (error) {
      console.error("[content] edge sync failed", JSON.stringify({ error: shortError(error) }));
    } finally {
      running = false;
    }
  };
  loop = setInterval(() => void tick(), LOOP_MS);
  loop.unref();
}

/** Test seam: forget the in-memory run and alert state. */
export function resetEdgeSyncForTests(): void {
  lastRunAt = null;
  lastReconcileAt = 0;
  notConfiguredLoggedAt = 0;
}

// ----------------------------------------------------------------------------
// Helpers for Safety (4.6). R1 to R3 build on these.
// ----------------------------------------------------------------------------

export interface HideResult {
  /** Items whose edge write landed in this call */
  synced: string[];
  /** Items the loop still holds (Cloudflare failed, or not configured) */
  pending: string[];
}

async function outcome(publicIds: string[]): Promise<HideResult> {
  const left = await prisma.contentItem.findMany({
    where: { publicId: { in: publicIds }, edgeDirtyAt: { not: null } },
    select: { publicId: true },
  });
  const pending = new Set(left.map(item => item.publicId));
  return {
    synced: publicIds.filter(id => !pending.has(id)),
    pending: publicIds.filter(id => pending.has(id)),
  };
}

/** Hides items from everyone, the owner included. Returns once KV accepted or the outbox holds it. */
export async function hideItems(publicIds: string[], reason: HiddenReason): Promise<HideResult> {
  const ids = [...new Set(publicIds)];
  const now = new Date();
  await prisma.contentItem.updateMany({
    where: { publicId: { in: ids } },
    data: { hiddenAt: now, hiddenReason: reason, ...edgeDirty(now) },
  });
  await syncEdge(ids, now);
  return outcome(ids);
}

/** Clears a Safety hide. The item returns to whatever its other fields say, never straight to OPEN. */
export async function restoreItems(publicIds: string[]): Promise<HideResult> {
  const ids = [...new Set(publicIds)];
  const now = new Date();
  await prisma.contentItem.updateMany({
    where: { publicId: { in: ids } },
    data: { hiddenAt: null, hiddenReason: null, ...edgeDirty(now) },
  });
  await syncEdge(ids, now);
  return outcome(ids);
}

/**
 * Suspend and reinstate: `User.block` decides, so both re-mark every item of the
 * creator and sync in bulk. Call after the user row is written.
 */
export async function hideCreator(userId: number): Promise<void> {
  await markCreatorItemsDirty(userId);
  await syncCreatorEdge(userId);
}

export const restoreCreator = hideCreator;

export interface EdgeStatus {
  state: ContentEdgeState;
  dirtySince: string | null;
  attempts: number;
  lastError: string | null;
}

/** For the Safety case view: what the edge holds and whether a change is waiting. */
export async function edgeStatus(publicId: string): Promise<EdgeStatus | null> {
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    select: { edgeState: true, edgeDirtyAt: true, edgeAttempts: true, edgeError: true },
  });
  if (!item) return null;
  return {
    state: item.edgeState,
    dirtySince: item.edgeDirtyAt ? item.edgeDirtyAt.toISOString() : null,
    attempts: item.edgeAttempts,
    lastError: item.edgeError,
  };
}
