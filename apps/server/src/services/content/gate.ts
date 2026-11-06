/**
 * The public face of an item's access rule (content gating 3.2 and 4.2): its
 * kind and summary, and whether it reads a stake. Never its params, so no pool
 * amount or minimum reaches a public card or page.
 */
import { prisma } from "@repo/database";
import {
  ACCESS_RULE_KINDS,
  ACCESS_RULE_SUMMARIES,
  STAKE_ACCESS_RULE_KINDS,
  type AccessRuleKind,
  type ContentGate,
} from "@repo/constants";
import { isFeatureOn } from "../featureFlags";
import { LISTED_ITEM_WHERE, PUBLIC_ITEM_WHERE } from "./access";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const isStake = (kind: string) => (STAKE_ACCESS_RULE_KINDS as readonly string[]).includes(kind);
const knownKind = (kind: string): AccessRuleKind =>
  (ACCESS_RULE_KINDS as readonly string[]).includes(kind) ? (kind as AccessRuleKind) : "any";

/** The filter for bio cards, the feed and the item page: listed when gating is on. */
export function listedItemWhere() {
  return isFeatureOn("accessGating") ? LISTED_ITEM_WHERE : PUBLIC_ITEM_WHERE;
}

/** Gates for a set of rule ids, keyed by rule id hex. */
export async function gatesFor(ruleIds: Uint8Array[]): Promise<Map<string, ContentGate>> {
  const out = new Map<string, ContentGate>();
  const unique = [...new Map(ruleIds.map(id => [hex(id), Buffer.from(id)])).values()];
  if (!unique.length) return out;
  const rules = await prisma.accessRule.findMany({
    where: { id: { in: unique } },
    select: { id: true, kind: true, params: true },
  });
  const leafIds = rules
    .filter(rule => rule.kind === "any" || rule.kind === "all")
    .flatMap(rule => (rule.params as { ruleIds?: string[] })?.ruleIds ?? [])
    .filter(id => /^[0-9a-f]{32}$/.test(id));
  const leaves = leafIds.length
    ? await prisma.accessRule.findMany({
        where: { id: { in: [...new Set(leafIds)].map(id => Buffer.from(id, "hex")) } },
        select: { id: true, kind: true, params: true },
      })
    : [];
  const leafKind = new Map(leaves.map(leaf => [hex(leaf.id), leaf.kind]));
  // The pool a stake rule reads, for Go to the pool. Pool pages are public.
  const poolOf = (rule: { kind: string; params: unknown }) =>
    isStake(rule.kind) ? Number((rule.params as { poolId?: unknown })?.poolId) || null : null;
  const leafPool = new Map(leaves.map(leaf => [hex(leaf.id), poolOf(leaf)]));
  const rulePool = new Map(
    rules.map(rule => [
      hex(rule.id),
      poolOf(rule) ??
        ((rule.params as { ruleIds?: string[] })?.ruleIds ?? [])
          .map(id => leafPool.get(id) ?? null)
          .find(id => id !== null) ??
        null,
    ])
  );
  const poolIds = [...new Set([...rulePool.values()].filter((id): id is number => id !== null))];
  const pools = poolIds.length
    ? await prisma.creatorPool.findMany({
        where: { id: { in: poolIds } },
        select: { id: true, poolAddress: true },
      })
    : [];
  const poolAddress = new Map(pools.map(pool => [pool.id, pool.poolAddress]));
  for (const rule of rules) {
    const kind = knownKind(rule.kind);
    const stake =
      isStake(kind) ||
      ((kind === "any" || kind === "all") &&
        ((rule.params as { ruleIds?: string[] })?.ruleIds ?? []).some(id =>
          isStake(leafKind.get(id) ?? "")
        ));
    const pool = rulePool.get(hex(rule.id)) ?? null;
    out.set(hex(rule.id), {
      kind,
      summary: ACCESS_RULE_SUMMARIES[kind],
      stake,
      ...(stake ? { poolAddress: pool === null ? null : (poolAddress.get(pool) ?? null) } : {}),
    });
  }
  // A rule that went missing still locks the item (default deny)
  for (const id of unique) {
    if (!out.has(hex(id))) {
      out.set(hex(id), { kind: "any", summary: ACCESS_RULE_SUMMARIES.any, stake: false });
    }
  }
  return out;
}
