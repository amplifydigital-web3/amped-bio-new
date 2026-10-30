/**
 * Access rules: load, validate and manage (gating spec 3.6). A stored row whose
 * params fail its kind's zod schema is treated as invalid and refuses.
 */
import { prisma } from "@repo/database";
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

async function ownerPool(ownerUserId: number, poolId: number): Promise<boolean> {
  const pool = await prisma.creatorPool.findUnique({
    where: { id: poolId },
    select: { wallet: { select: { userId: true } } },
  });
  return pool?.wallet.userId === ownerUserId;
}

/** Turns creator input into stored params. Stake minimums arrive as whole tREVO. */
async function toStoredParams(
  ownerUserId: number,
  input: AccessRuleInput
): Promise<Record<string, unknown>> {
  switch (input.kind) {
    case "follower":
      return {};
    case "pool_member":
    case "stake_min": {
      // v1 decision 3: only the owner's own pool
      if (!(await ownerPool(ownerUserId, input.params.poolId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick your own pool." });
      }
      if (input.kind === "pool_member") return { poolId: input.params.poolId };
      const minWei = wholeTokensToWei(input.params.minTrevo);
      if (!minWei) throw new TRPCError({ code: "BAD_REQUEST", message: "A whole number of tREVO" });
      return { poolId: input.params.poolId, minWei };
    }
    case "any":
    case "all": {
      // 2 to 4 leaves, depth 1, all the owner's own
      const leaves = await prisma.accessRule.findMany({
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
      return { ruleIds: input.params.ruleIds };
    }
  }
}

export async function createRule(
  ownerUserId: number,
  input: AccessRuleInput & { name?: string | null; opensToAllAt?: Date | null }
) {
  const params = await toStoredParams(ownerUserId, input);
  // Belt and braces: the stored shape must pass the read schema too
  if (!ACCESS_RULE_PARAMS[input.kind].safeParse(params).success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid rule" });
  }
  const id = uuidv7();
  await prisma.accessRule.create({
    data: {
      id,
      ownerUserId,
      kind: input.kind,
      params,
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
