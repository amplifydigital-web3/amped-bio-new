/**
 * Nightly access jobs (gating spec 3.9 and P1 item 4, G6).
 *
 * 1. Leak scan. The CI leak tests run on fixtures. This scan runs the same public builders
 *    the bio, the item page and the content sitemap use, over real gated rows, and reports
 *    any gated block or item whose public form carries what only a fan who passes may see:
 *    a block's URL, body or embed, a content cover, or a sitemap entry. Target: 0.
 * 2. Retention. AccessEvent rows are kept 25 months (docs/legal/privacy-parameters.md), then
 *    deleted in batches.
 *
 * One instance runs it each night: a Redis key per UTC day, or a per process date when there
 * is no Redis. The report names resources only (`block:12`, `content:abc`), never a fan.
 */
import { prisma } from "@repo/database";
import { LOCKABLE_BLOCK_TYPES } from "@repo/constants";
import { getRedisClient } from "../../utils/cache";
import { sanitizeBlockConfig } from "../../utils/sanitizeBlockConfig";
import { publicBlocksFor } from "./blocks";
import { contentSitemapEntries, publicCardsFor } from "../content/publicView";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** The scan runs in the first tick after 03:00 UTC */
export const ACCESS_NIGHTLY_HOUR_UTC = 3;
/** 25 months, as the privacy parameters list them */
export const ACCESS_EVENT_RETENTION_DAYS = 761;
const PURGE_BATCH = 5_000;
const PURGE_MAX_BATCHES = 200;
/** Newest gated rows first, up to this many of each per night */
export const LEAK_SCAN_MAX = 5_000;
const SITEMAP_PAGE = 1_000;
const SITEMAP_MAX_PAGES = 50;
/** A config value shorter than this is too generic to match on ("text", "x.com") */
const SECRET_MIN_LENGTH = 8;
export const LEAK_SCAN_SETTING_KEY = "access_leak_scan_last";

export type LeakFinding = {
  /** `block:12` or `content:abc123` */
  resource: string;
  check: "block_config" | "block_unlocked" | "content_cover" | "content_unlocked" | "sitemap";
};

export type LeakScanReport = {
  ranAt: string;
  blocks: number;
  items: number;
  sitemapEntries: number;
  /** True when a cap stopped the scan before every gated row was read */
  truncated: boolean;
  leaks: LeakFinding[];
};

/** String values a locked block must never show: everything but its label and platform. */
function blockSecrets(type: string, config: unknown): string[] {
  const clean = sanitizeBlockConfig(type, config) as Record<string, unknown> | null;
  if (!clean) return [];
  return Object.entries(clean)
    .filter(([key, value]) => key !== "label" && key !== "platform" && typeof value === "string")
    .map(([, value]) => (value as string).trim())
    .filter(value => value.length >= SECRET_MIN_LENGTH);
}

async function scanBlocks(leaks: LeakFinding[]) {
  const gated = await prisma.block.findMany({
    where: { accessRuleId: { not: null }, type: { in: [...LOCKABLE_BLOCK_TYPES] } },
    orderBy: { id: "desc" },
    take: LEAK_SCAN_MAX + 1,
    select: { id: true, user_id: true, type: true, config: true, accessRuleId: true },
  });
  const truncated = gated.length > LEAK_SCAN_MAX;
  const rows = gated.slice(0, LEAK_SCAN_MAX);
  const byUser = new Map<number, typeof rows>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
  for (const [, blocks] of byUser) {
    const out = await publicBlocksFor(
      blocks.map(block => ({
        id: block.id,
        type: block.type,
        clicks: 0,
        config: sanitizeBlockConfig(block.type, block.config),
      })),
      blocks
    );
    const shown = new Map(out.map(block => [block.id, block]));
    for (const block of blocks) {
      const pub = shown.get(block.id);
      // Left off the page (flag off, hidden, not renderable): nothing to leak
      if (!pub) continue;
      const resource = `block:${block.id}`;
      if (!pub.gated) {
        leaks.push({ resource, check: "block_unlocked" });
        continue;
      }
      const json = JSON.stringify(pub);
      if (blockSecrets(block.type, block.config).some(secret => json.includes(secret))) {
        leaks.push({ resource, check: "block_config" });
      }
    }
  }
  return { count: rows.length, truncated };
}

async function scanContent(leaks: LeakFinding[]) {
  const gated = await prisma.contentItem.findMany({
    where: { accessRuleId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: LEAK_SCAN_MAX + 1,
    select: { publicId: true, userId: true },
  });
  const truncated = gated.length > LEAK_SCAN_MAX;
  const rows = gated.slice(0, LEAK_SCAN_MAX);
  const byUser = new Map<number, string[]>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.publicId]);
  for (const [userId, publicIds] of byUser) {
    const cards = await publicCardsFor(userId, publicIds);
    for (const publicId of publicIds) {
      const card = cards[publicId];
      // Not public (draft, 18+, deleted, flag off): nothing to leak
      if (!card) continue;
      const resource = `content:${publicId}`;
      if (!card.gate) leaks.push({ resource, check: "content_unlocked" });
      else if (card.cover !== null) leaks.push({ resource, check: "content_cover" });
    }
  }
  return { ids: new Set(rows.map(row => row.publicId)), count: rows.length, truncated };
}

async function scanSitemap(gatedIds: Set<string>, leaks: LeakFinding[]) {
  let entries = 0;
  for (let page = 0; page < SITEMAP_MAX_PAGES; page++) {
    const batch = await contentSitemapEntries(page, SITEMAP_PAGE);
    entries += batch.length;
    for (const entry of batch) {
      if (gatedIds.has(entry.publicId)) {
        leaks.push({ resource: `content:${entry.publicId}`, check: "sitemap" });
      }
    }
    if (batch.length < SITEMAP_PAGE) return { entries, truncated: false };
  }
  return { entries, truncated: true };
}

export async function scanLeaks(now = new Date()): Promise<LeakScanReport> {
  const leaks: LeakFinding[] = [];
  const blocks = await scanBlocks(leaks);
  const content = await scanContent(leaks);
  const sitemap = await scanSitemap(content.ids, leaks);
  const report: LeakScanReport = {
    ranAt: now.toISOString(),
    blocks: blocks.count,
    items: content.count,
    sitemapEntries: sitemap.entries,
    truncated: blocks.truncated || content.truncated || sitemap.truncated,
    leaks,
  };
  if (leaks.length) {
    console.error("[access] leak scan found gated resources in public output", {
      count: leaks.length,
      leaks: leaks.slice(0, 50),
    });
  } else {
    console.log("[access] leak scan clean", {
      blocks: report.blocks,
      items: report.items,
      sitemapEntries: report.sitemapEntries,
      truncated: report.truncated,
    });
  }
  await prisma.siteSettings.upsert({
    where: { setting_key: LEAK_SCAN_SETTING_KEY },
    create: {
      setting_key: LEAK_SCAN_SETTING_KEY,
      setting_value: JSON.stringify(report),
      value_type: "JSON",
    },
    update: { setting_value: JSON.stringify(report) },
  });
  return report;
}

/** Deletes access events older than 25 months, in batches. Returns the rows deleted. */
export async function purgeAccessEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ACCESS_EVENT_RETENTION_DAYS * DAY);
  let deleted = 0;
  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
    const old = await prisma.accessEvent.findMany({
      where: { createdAt: { lt: cutoff } },
      take: PURGE_BATCH,
      select: { id: true },
    });
    if (!old.length) break;
    const result = await prisma.accessEvent.deleteMany({
      where: { id: { in: old.map(row => row.id) } },
    });
    deleted += result.count;
    if (old.length < PURGE_BATCH) break;
  }
  return deleted;
}

let lastLocalRun: string | null = null;

/** True once per UTC day across instances: Redis SET NX, or a per process date. */
async function claimNight(day: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const claimed = await redis.set(`access:nightly:${day}`, "1", "EX", 2 * 24 * 3600, "NX");
      return claimed !== null;
    } catch {
      // fall through to the per process date
    }
  }
  if (lastLocalRun === day) return false;
  lastLocalRun = day;
  return true;
}

export async function runAccessNightly(now = new Date()) {
  if (now.getUTCHours() < ACCESS_NIGHTLY_HOUR_UTC) return null;
  const day = now.toISOString().slice(0, 10);
  if (!(await claimNight(day))) return null;
  const purged = await purgeAccessEvents(now).catch(err => {
    console.error("[access] event purge failed", { message: String(err) });
    return 0;
  });
  const report = await scanLeaks(now).catch(err => {
    console.error("[access] leak scan failed", { message: String(err) });
    return null;
  });
  return { purged, report };
}

let ticker: NodeJS.Timeout | null = null;

/** Checks hourly; the work runs once per UTC day after 03:00. */
export function startAccessNightly() {
  if (ticker || process.env.NODE_ENV === "test") return;
  ticker = setInterval(() => void runAccessNightly().catch(() => undefined), HOUR);
  ticker.unref();
  console.log("[access] nightly leak scan and event purge scheduled");
}

/** For tests only. */
export function __resetAccessNightlyForTests() {
  lastLocalRun = null;
  if (ticker) clearInterval(ticker);
  ticker = null;
}
