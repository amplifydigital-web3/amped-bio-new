/**
 * Access rules: load, validate and manage (gating spec 3.6). A stored row whose
 * params fail its kind's zod schema is treated as invalid and refuses.
 */
import { prisma, type Prisma } from "@repo/database";
import {
  ACCESS_RULE_KINDS,
  ACCESS_RULE_PARAMS,
  wholeTokensToWei,
  type AccessRuleInput,
  type AccessRuleKind,
} from "@repo/constants";
import { TRPCError } from "@trpc/server";
import { cache } from "../../utils/cache";
import { uuidv7 } from "../../utils/uuid-v7";
import { assertStakeKindsAllowed } from "./allowlist";

/** prisma, or the client of a transaction in progress */
export type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0] | typeof prisma;

export type LoadedRule = {
  id: string;
  ownerUserId: number;
  kind: AccessRuleKind;
  params: Record<string, unknown>;
  opensToAllAt: Date | null;
  version: number;
};

const RULE_CACHE_SECONDS = 300;
const ruleKey = (id: string) => `access:rule:${id}`;

/** The earliest instant a rule may open to everyone: UTC midnight tomorrow. */
export function earliestOpenToAllAt(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

/** The picker shows "Open to everyone on"; the server enforces the same floor. */
function assertOpenDate(date: Date | null | undefined, now = new Date()) {
  if (!date) return;
  if (Number.isNaN(date.getTime()) || date.getTime() < earliestOpenToAllAt(now).getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose tomorrow or a later date." });
  }
}

export const idToHex = (id: Buffer | Uint8Array) => Buffer.from(id).toString("hex");
export const hexToId = (hex: string) => Buffer.from(hex, "hex");

/** Validates a stored row. Exported for tests. */
export function parseRuleRow(row: {
  id: Buffer | Uint8Array;
  ownerUserId: number;
  kind: string;
  params: unknown;
  opensToAllAt: Date | null;
  version: number;
}): LoadedRule | "invalid" {
  if (!(ACCESS_RULE_KINDS as readonly string[]).includes(row.kind)) return "invalid";
  const kind = row.kind as AccessRuleKind;
  const parsed = ACCESS_RULE_PARAMS[kind].safeParse(row.params);
  if (!parsed.success) return "invalid";
  return {
    id: idToHex(row.id),
    ownerUserId: row.ownerUserId,
    kind,
    params: parsed.data as Record<string, unknown>,
    opensToAllAt: row.opensToAllAt,
    version: row.version,
  };
}

type CachedRule = Omit<LoadedRule, "opensToAllAt"> & { opensToAllAt: string | null };

/**
 * One rule, or null when it does not exist, or "invalid" when its params fail.
 * Render reads a 5 minute cache; open (fresh) always reads the database.
 */
export async function loadRule(
  idHex: string,
  opts: { fresh?: boolean } = {}
): Promise<LoadedRule | "invalid" | null> {
  if (!/^[0-9a-f]{32}$/.test(idHex)) return null;
  if (!opts.fresh) {
    const hit = await cache.get<CachedRule>(ruleKey(idHex));
    if (hit) {
      const reparsed = parseRuleRow({
        id: hexToId(hit.id),
        ownerUserId: hit.ownerUserId,
        kind: hit.kind,
        params: hit.params,
        opensToAllAt: hit.opensToAllAt ? new Date(hit.opensToAllAt) : null,
        version: hit.version,
      });
      return reparsed;
    }
  }
  const row = await prisma.accessRule.findUnique({
    where: { id: hexToId(idHex) },
    select: {
      id: true,
      ownerUserId: true,
      kind: true,
      params: true,
      opensToAllAt: true,
      version: true,
    },
  });
  if (!row) return null;
  const rule = parseRuleRow(row);
  if (rule !== "invalid") {
    await cache.set<CachedRule>(
      ruleKey(idHex),
      { ...rule, opensToAllAt: rule.opensToAllAt ? rule.opensToAllAt.toISOString() : null },
      RULE_CACHE_SECONDS
    );
  }
  return rule;
}

async function ownerPool(db: Db, ownerUserId: number, poolId: number): Promise<boolean> {
  const pool = await db.creatorPool.findUnique({
    where: { id: poolId },
    select: { wallet: { select: { userId: true } } },
  });
  return pool?.wallet.userId === ownerUserId;
}

/** Turns creator input into stored params. Stake minimums arrive as whole tREVO. */
async function toStoredParams(
  ownerUserId: number,
  input: AccessRuleInput,
  db: Db = prisma
): Promise<Record<string, unknown>> {
  switch (input.kind) {
    case "follower":
      return {};
    case "pool_member":
    case "stake_min": {
      // Pilot allowlist (OB-Q65): same refusal as content.update
      await assertStakeKindsAllowed(ownerUserId, [input.kind]);
      // v1 decision 3: only the owner's own pool
      if (!(await ownerPool(db, ownerUserId, input.params.poolId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick your own pool." });
      }
      if (input.kind === "pool_member") return { poolId: input.params.poolId };
      const minWei = wholeTokensToWei(input.params.minTrevo);
      if (!minWei) throw new TRPCError({ code: "BAD_REQUEST", message: "A whole number of tREVO" });
      return { poolId: input.params.poolId, minWei };
    }
    case "paid": {
      // G4: only the owner's own product, and never an archived one
      const offer = await db.offer.findUnique({
        where: { id: hexToId(input.params.offerId) },
        select: { creatorUserId: true, status: true },
      });
      if (!offer || offer.creatorUserId !== ownerUserId || offer.status === "archived") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick one of your own products." });
      }
      return { offerId: input.params.offerId };
    }
    case "member": {
      // G5: only the owner's own plan. A draft or paused plan is allowed: items can be
      // gated before the plan takes members, and nobody passes until someone joins
      const plan = await db.membershipPlan.findUnique({
        where: { id: hexToId(input.params.planId) },
        select: { creatorUserId: true },
      });
      if (!plan || plan.creatorUserId !== ownerUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set up your membership first." });
      }
      return { planId: input.params.planId };
    }
    case "any":
    case "all": {
      // 2 to 4 leaves, depth 1, all the owner's own
      const leaves = await db.accessRule.findMany({
        where: { id: { in: input.params.ruleIds.map(hexToId) } },
        select: { ownerUserId: true, kind: true },
      });
      const ok =
        leaves.length === new Set(input.params.ruleIds).size &&
        leaves.every(
          leaf => leaf.ownerUserId === ownerUserId && leaf.kind !== "any" && leaf.kind !== "all"
        );
      if (!ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Combine 2 to 4 of your own single rules.",
        });
      }
      await assertStakeKindsAllowed(
        ownerUserId,
        leaves.map(leaf => leaf.kind)
      );
      return { ruleIds: input.params.ruleIds };
    }
  }
}

export async function createRule(
  ownerUserId: number,
  input: AccessRuleInput & { name?: string | null; opensToAllAt?: Date | null },
  db: Db = prisma
) {
  assertOpenDate(input.opensToAllAt);
  const params = await toStoredParams(ownerUserId, input, db);
  // Belt and braces: the stored shape must pass the read schema too
  if (!ACCESS_RULE_PARAMS[input.kind].safeParse(params).success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid rule" });
  }
  const id = uuidv7();
  await db.accessRule.create({
    data: {
      id,
      ownerUserId,
      kind: input.kind,
      params: params as Prisma.InputJsonObject,
      name: input.name ?? null,
      opensToAllAt: input.opensToAllAt ?? null,
    },
  });
  return idToHex(id);
}

/** Uses of a rule: blocks, content items, and combinators that list it. */
export async function ruleUseCount(ownerUserId: number, idHex: string): Promise<number> {
  const id = hexToId(idHex);
  const [blocks, items, combos] = await Promise.all([
    prisma.block.count({ where: { accessRuleId: id } }),
    prisma.contentItem.count({ where: { OR: [{ accessRuleId: id }, { baseAccessRuleId: id }] } }),
    prisma.accessRule.findMany({
      where: { ownerUserId, kind: { in: ["any", "all"] } },
      select: { params: true },
    }),
  ]);
  const inCombos = combos.filter(combo =>
    ((combo.params as { ruleIds?: string[] })?.ruleIds ?? []).includes(idHex)
  ).length;
  return blocks + items + inCombos;
}

async function ownRule(ownerUserId: number, idHex: string) {
  const row = await prisma.accessRule.findUnique({
    where: { id: hexToId(idHex) },
    select: { ownerUserId: true, kind: true },
  });
  if (!row || row.ownerUserId !== ownerUserId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found." });
  }
  return row;
}

/** kind is immutable; an edit bumps version so cached decisions are not reused. */
export async function updateRule(
  ownerUserId: number,
  idHex: string,
  patch: { name?: string | null; opensToAllAt?: Date | null; input?: AccessRuleInput }
) {
  const row = await ownRule(ownerUserId, idHex);
  if (patch.input && patch.input.kind !== row.kind) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A rule's kind cannot change." });
  }
  assertOpenDate(patch.opensToAllAt);
  const params = patch.input ? await toStoredParams(ownerUserId, patch.input) : undefined;
  await prisma.accessRule.update({
    where: { id: hexToId(idHex) },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.opensToAllAt !== undefined ? { opensToAllAt: patch.opensToAllAt } : {}),
      ...(params ? { params } : {}),
      version: { increment: 1 },
    },
  });
  await cache.delete(ruleKey(idHex));
}

/** A rule in use cannot be deleted (CONFLICT with the count). The database also refuses. */
export async function deleteRule(ownerUserId: number, idHex: string) {
  await ownRule(ownerUserId, idHex);
  const uses = await ruleUseCount(ownerUserId, idHex);
  if (uses > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This rule is used ${uses} ${uses === 1 ? "time" : "times"}. Remove it there first.`,
    });
  }
  await prisma.accessRule.delete({ where: { id: hexToId(idHex) } });
  await cache.delete(ruleKey(idHex));
}

export async function listRules(ownerUserId: number) {
  const rows = await prisma.accessRule.findMany({
    where: { ownerUserId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ownerUserId: true,
      name: true,
      kind: true,
      params: true,
      opensToAllAt: true,
      version: true,
    },
  });
  return Promise.all(
    rows.map(async row => {
      const parsed = parseRuleRow(row);
      return {
        id: idToHex(row.id),
        name: row.name,
        kind: row.kind,
        valid: parsed !== "invalid",
        // The creator sees their own params, including their own minimum
        params: parsed === "invalid" ? null : parsed.params,
        opensToAllAt: row.opensToAllAt?.toISOString() ?? null,
        uses: await ruleUseCount(ownerUserId, idToHex(row.id)),
      };
    })
  );
}

/**
 * Deletes a rule when it is inline (name null) and nothing references it: no
 * item (accessRuleId or baseAccessRuleId), no block, no any or all rule. Its
 * inline leaves follow by the same test. Saved rules are never deleted here
 * (content gating 3.5). Run inside the transaction that changed the reference.
 */
export async function cleanupInlineRule(db: Db, idHex: string): Promise<string[]> {
  const deleted: string[] = [];
  const row = await db.accessRule.findUnique({
    where: { id: hexToId(idHex) },
    select: { ownerUserId: true, name: true, kind: true, params: true },
  });
  if (!row || row.name !== null) return deleted;
  const id = hexToId(idHex);
  const [blocks, items, combos] = await Promise.all([
    db.block.count({ where: { accessRuleId: id } }),
    db.contentItem.count({ where: { OR: [{ accessRuleId: id }, { baseAccessRuleId: id }] } }),
    db.accessRule.findMany({
      where: { ownerUserId: row.ownerUserId, kind: { in: ["any", "all"] } },
      select: { params: true },
    }),
  ]);
  const inCombos = combos.some(combo =>
    ((combo.params as { ruleIds?: string[] })?.ruleIds ?? []).includes(idHex)
  );
  if (blocks + items > 0 || inCombos) return deleted;
  await db.accessRule.delete({ where: { id } });
  deleted.push(idHex);
  if (row.kind === "any" || row.kind === "all") {
    for (const leaf of (row.params as { ruleIds?: string[] })?.ruleIds ?? []) {
      deleted.push(...(await cleanupInlineRule(db, leaf)));
    }
  }
  return deleted;
}

/** Drop cached rows after the transaction that deleted them commits. */
export async function forgetRules(idHexes: string[]) {
  await Promise.all(idHexes.map(id => cache.delete(ruleKey(id))));
}
