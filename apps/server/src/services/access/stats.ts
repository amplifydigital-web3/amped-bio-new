/**
 * Access insights for the creator (gating spec 3.10 delta 8, G6). Totals only: by rule,
 * by refusal reason and by item, counted as distinct viewer keys over AccessEvent rows.
 *
 * Privacy (Fan Graph 3.8, privacy notice line in 3.6): nothing here returns a viewer key,
 * a name, a handle, an avatar, a wallet or an event time. A bucket of 1 to 4 viewers
 * leaves the server as "under_5", and a rate needs 5 or more on both sides. The
 * suppression runs here, so a small count never reaches the client.
 */
import { prisma, Prisma } from "@repo/database";
import {
  ACCESS_REASONS,
  ACCESS_RULE_KINDS,
  ACCESS_RULE_SUMMARIES,
  ACCESS_STATS_ITEMS_MAX,
  accessOpenRate,
  accessStatCount,
  type AccessReason,
  type AccessRuleKind,
  type AccessRulesStats,
  type AccessStatRow,
  type AccessStatsRange,
} from "@repo/constants";
import { idToHex, listRules } from "./rules";

const DAY = 86_400_000;
const RANGE_DAYS: Record<AccessStatsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

type Counts = { locked: number; tried: number; opened: number };
type CountRow = { k: Uint8Array | string | null; locked: unknown; tried: unknown; opened: unknown };

const num = (value: unknown) => Number(value ?? 0);

function row(counts: Counts): AccessStatRow {
  return {
    lockedViewers: accessStatCount(counts.locked),
    triedViewers: accessStatCount(counts.tried),
    openedViewers: accessStatCount(counts.opened),
    openRate: accessOpenRate(counts.opened, counts.tried),
  };
}

const EMPTY: Counts = { locked: 0, tried: 0, opened: 0 };

// Distinct viewers who saw it locked, tried to open it, and opened it. `unlocked` is a
// passing open check, `revealed` a passing open that returned the body; both are opens.
const countColumns = () => Prisma.sql`
  COUNT(DISTINCT CASE WHEN type = 'locked_view' THEN viewer_key END) AS locked,
  COUNT(DISTINCT CASE WHEN type IN ('denied', 'unlocked', 'revealed') THEN viewer_key END) AS tried,
  COUNT(DISTINCT CASE WHEN type IN ('unlocked', 'revealed') THEN viewer_key END) AS opened`;

/**
 * Rule ids that exist only as the inline leaves of a combinator. Events carry the
 * combinator's id, so a leaf has no events of its own and no row in the list.
 */
async function inlineLeafIds(ownerUserId: number): Promise<Set<string>> {
  const combos = await prisma.accessRule.findMany({
    where: { ownerUserId, kind: { in: ["any", "all"] } },
    select: { params: true },
  });
  const ids = combos.flatMap(combo => (combo.params as { ruleIds?: string[] })?.ruleIds ?? []);
  if (!ids.length) return new Set();
  const inline = await prisma.accessRule.findMany({
    where: { ownerUserId, name: null, id: { in: ids.map(id => Buffer.from(id, "hex")) } },
    select: { id: true },
  });
  return new Set(inline.map(leaf => idToHex(leaf.id)));
}

/** The item title or block label for By item. Only the owner's own resources. */
async function itemLabels(ownerUserId: number, resources: string[]) {
  const contentIds = resources.filter(r => r.startsWith("content:")).map(r => r.slice(8));
  const blockIds = resources
    .filter(r => r.startsWith("block:"))
    .map(r => r.slice(6))
    .filter(id => /^\d{1,10}$/.test(id))
    .map(Number);
  const [items, blocks] = await Promise.all([
    contentIds.length
      ? prisma.contentItem.findMany({
          where: { userId: ownerUserId, publicId: { in: contentIds } },
          select: { publicId: true, title: true },
        })
      : Promise.resolve([]),
    blockIds.length
      ? prisma.block.findMany({
          where: { user_id: ownerUserId, id: { in: blockIds } },
          select: { id: true, type: true, config: true },
        })
      : Promise.resolve([]),
  ]);
  const labels = new Map<string, string>();
  for (const item of items) labels.set(`content:${item.publicId}`, item.title || "Untitled");
  for (const block of blocks) {
    const config = (block.config ?? {}) as { label?: unknown };
    const label = typeof config.label === "string" && config.label.trim() ? config.label : null;
    labels.set(
      `block:${block.id}`,
      label ??
        (block.type === "text" ? "Text block" : block.type === "media" ? "Media block" : "Link")
    );
  }
  return labels;
}

export async function accessRulesStats(
  ownerUserId: number,
  range: AccessStatsRange,
  now = new Date()
): Promise<AccessRulesStats> {
  const since = new Date(now.getTime() - RANGE_DAYS[range] * DAY);
  const where = Prisma.sql`owner_user_id = ${ownerUserId} AND created_at >= ${since} AND rule_id IS NOT NULL`;

  const cols = countColumns();
  const [totals, byRule, byItem, byReason, rules, leaves] = await Promise.all([
    prisma.$queryRaw<
      CountRow[]
    >`SELECT NULL AS k, ${cols} FROM access_events WHERE ${where}`,
    prisma.$queryRaw<CountRow[]>`
      SELECT rule_id AS k, ${cols} FROM access_events WHERE ${where} GROUP BY rule_id`,
    prisma.$queryRaw<CountRow[]>`
      SELECT resource AS k, ${cols} FROM access_events WHERE ${where}
      GROUP BY resource ORDER BY locked DESC, resource ASC LIMIT ${ACCESS_STATS_ITEMS_MAX}`,
    // Why fans were kept out: locked views and refused opens, by reason
    prisma.$queryRaw<Array<{ reason: string | null; viewers: unknown }>>`
      SELECT reason, COUNT(DISTINCT viewer_key) AS viewers FROM access_events
      WHERE ${where} AND type IN ('locked_view', 'denied') AND reason IS NOT NULL
      GROUP BY reason ORDER BY viewers DESC`,
    listRules(ownerUserId),
    inlineLeafIds(ownerUserId),
  ]);

  const counts = (r: CountRow | undefined): Counts =>
    r ? { locked: num(r.locked), tried: num(r.tried), opened: num(r.opened) } : EMPTY;
  const ruleCounts = new Map(
    byRule.map(r => [typeof r.k === "string" ? r.k : idToHex(r.k as Uint8Array), counts(r)])
  );

  const kinds = new Set<string>(ACCESS_RULE_KINDS);
  const reasons = new Set<string>(ACCESS_REASONS);
  const labels = await itemLabels(
    ownerUserId,
    byItem.map(r => String(r.k))
  );

  return {
    range,
    totals: row(counts(totals[0])),
    rules: rules
      // A rule on no item and with no name is left over; a leaf has no events of its own
      .filter(rule => kinds.has(rule.kind) && !leaves.has(rule.id) && (rule.name || rule.uses))
      .map(rule => ({
        ...row(ruleCounts.get(rule.id) ?? EMPTY),
        ruleId: rule.id,
        kind: rule.kind as AccessRuleKind,
        summary: ACCESS_RULE_SUMMARIES[rule.kind as AccessRuleKind],
        name: rule.name,
        uses: rule.uses,
        opensToAllAt: rule.opensToAllAt,
      })),
    reasons: byReason
      .filter(r => r.reason && reasons.has(r.reason))
      .map(r => ({ reason: r.reason as AccessReason, viewers: accessStatCount(num(r.viewers)) })),
    items: byItem.flatMap(r => {
      const key = String(r.k);
      const label = labels.get(key);
      // Only resources still on the owner's page; a deleted item has no label
      if (!label) return [];
      const [type, ...rest] = key.split(":");
      if (type !== "content" && type !== "block") return [];
      return [{ ...row(counts(r)), type, id: rest.join(":"), label }];
    }),
  };
}
