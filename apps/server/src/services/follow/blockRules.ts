import { FOLLOWER_COUNT_FLOOR, publicCount } from "./rules";

/**
 * Follow block and Followers block (Fan Graph phase 1c, Build Board #30).
 * Pure rules behind `follow.blockData`, shared with the unit tests. Spec:
 * docs/features/follow-blocks.md, 3.3 and 3.6.
 *
 * Every number the card can show passes through here. The rule is simple:
 * the card never shows a number the frame capsule would not show, so each
 * numeric field is null while the creator hides the count or while the count
 * is under the floor. Growth is never negative, sources are kinds only, and
 * faces are opted-in followers alone.
 */

export const MILESTONES = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000] as const;

/** Kinds a visitor may see. `page` and `block` are one kind to the public. */
export const PUBLIC_SOURCE_KINDS = ["page", "explore", "qr", "pool", "broadcast"] as const;
export type PublicSourceKind = (typeof PUBLIC_SOURCE_KINDS)[number];

/** The smallest share a source kind needs to appear on the card. */
export const SOURCE_MIN_SHARE = 0.05;
export const SOURCE_MAX_KINDS = 3;

/** Fewer opted-in followers than this hides the faces row (decision 6). */
export const FACES_MIN = 3;
export const FACES_LOOKBACK_DAYS = 30;

/** True when the card may show numbers: the creator shows the count and it is at the floor. */
export function numbersVisible(count: number, showCount: boolean): boolean {
  const pc = publicCount(count, showCount);
  return pc.showCount && !pc.newOnAmped && count >= FOLLOWER_COUNT_FLOOR;
}

/** "+48 this week" only when the period added followers (decision 5). */
export function publicGrowth(newInRange: number, visible: boolean): number | null {
  if (!visible) return null;
  return newInRange > 0 ? newInRange : null;
}

/**
 * Thirty daily cumulative counts ending today, built backwards from the
 * current count. Unfollows are already out of `count` and never appear as a
 * drop, so the series cannot fall below its start (decision 5).
 *
 * `followsPerDay[i]` is the number of counted follows created on day i, where
 * day 29 is today and day 0 is 29 days ago.
 */
export function cumulativeSeries(
  count: number,
  followsPerDay: number[],
  visible: boolean
): number[] | null {
  if (!visible) return null;
  const days = FACES_LOOKBACK_DAYS;
  const series = new Array<number>(days).fill(0);
  let running = count;
  for (let day = days - 1; day >= 0; day--) {
    series[day] = Math.max(0, running);
    running -= followsPerDay[day] ?? 0;
  }
  return series;
}

/** Day index (0 to 29, 29 is today) of a timestamp, or null when outside the window. */
export function dayIndex(createdAt: Date, now: Date = new Date()): number | null {
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayStart = Date.UTC(
    createdAt.getUTCFullYear(),
    createdAt.getUTCMonth(),
    createdAt.getUTCDate()
  );
  const back = Math.round((todayStart - dayStart) / dayMs);
  if (back < 0 || back >= FACES_LOOKBACK_DAYS) return null;
  return FACES_LOOKBACK_DAYS - 1 - back;
}

/** The highest milestone reached, or null below the first or while numbers are hidden. */
export function publicMilestone(count: number, visible: boolean): number | null {
  if (!visible) return null;
  let reached: number | null = null;
  for (const milestone of MILESTONES) {
    if (count >= milestone) reached = milestone;
  }
  return reached;
}

/**
 * Source kinds as shares of all counted follows. `block` folds into `page`
 * (decision 8), campaigns never appear (decision 7), kinds under 5 percent
 * drop, and at most three remain, largest first.
 */
export function publicSources(
  bySource: { source: string; count: number }[],
  visible: boolean
): { kind: PublicSourceKind; share: number }[] | null {
  if (!visible) return null;
  const totals = new Map<PublicSourceKind, number>();
  let total = 0;
  for (const row of bySource) {
    const kind: PublicSourceKind | null =
      row.source === "block" || row.source === "page"
        ? "page"
        : (PUBLIC_SOURCE_KINDS as readonly string[]).includes(row.source)
          ? (row.source as PublicSourceKind)
          : null;
    if (!kind) continue;
    totals.set(kind, (totals.get(kind) ?? 0) + row.count);
    total += row.count;
  }
  if (total === 0) return [];
  return [...totals.entries()]
    .map(([kind, count]) => ({ kind, share: count / total }))
    .filter(row => row.share >= SOURCE_MIN_SHARE)
    .sort((a, b) => b.share - a.share)
    .slice(0, SOURCE_MAX_KINDS)
    .map(row => ({ kind: row.kind, share: Math.round(row.share * 100) / 100 }));
}

/** Pool fan overlap: null without a pool, while numbers are hidden, or at zero. */
export function publicPoolFans(
  poolFanFollowers: number,
  count: number,
  hasPool: boolean,
  visible: boolean
): { poolFans: number; poolFanShare: number } | null {
  if (!hasPool || !visible || poolFanFollowers <= 0 || count <= 0) return null;
  return {
    poolFans: poolFanFollowers,
    poolFanShare: Math.round((poolFanFollowers / count) * 100) / 100,
  };
}

export type PublicFace = {
  name: string | null;
  /** Null for a fan whose page is not published (QA-008) */
  handle: string | null;
  photo: string | null;
  poolFan: boolean;
};

/**
 * The faces row shows opted-in followers only, and never fewer than three,
 * so one face never stands alone (decision 6). `candidates` must already be
 * filtered to `show_publicly = true` counted followers.
 */
export function publicFaces<T extends { poolFan: boolean }>(
  candidates: T[],
  order: "newest" | "longest" | "poolFans",
  max: number
): T[] {
  if (candidates.length < FACES_MIN) return [];
  const ordered =
    order === "poolFans"
      ? [...candidates].sort((a, b) => Number(b.poolFan) - Number(a.poolFan))
      : candidates;
  return ordered.slice(0, max);
}
