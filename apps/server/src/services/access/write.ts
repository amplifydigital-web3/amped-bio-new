/**
 * Writing a rule onto a resource from an editor (content gating 3.5, G3): a
 * saved rule by id, an inline leaf, or Any of these over inline leaves. Shared
 * by content.update and blocks.setAccessRule so both refuse the same things.
 */
import { prisma } from "@repo/database";
import {
  ACCESS_RULE_SUMMARIES,
  LIVE_ACCESS_RULE_KINDS,
  type ContentAccessInput,
} from "@repo/constants";
import { TRPCError } from "@trpc/server";
import { assertStakeKindsAllowed } from "./allowlist";
import { createRule, loadRule, type Db } from "./rules";

export const ACCESS_WRITE_MESSAGES = {
  gatingOff: "Gating is not available yet.",
  ruleKind: "That rule is not available yet.",
  ruleNotFound: "Rule not found.",
} as const;

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

/** The rule id an editor write resolves to, created inline where asked. Run in a transaction. */
export async function resolveAccessInput(
  tx: Db,
  ownerUserId: number,
  access: ContentAccessInput
): Promise<Buffer> {
  if ("ruleId" in access) {
    const rule = await loadRule(access.ruleId, { fresh: true });
    if (!rule || rule === "invalid" || rule.ownerUserId !== ownerUserId) {
      throw new TRPCError({ code: "NOT_FOUND", message: ACCESS_WRITE_MESSAGES.ruleNotFound });
    }
    if (!(LIVE_ACCESS_RULE_KINDS as readonly string[]).includes(rule.kind)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: ACCESS_WRITE_MESSAGES.ruleKind });
    }
    const kinds: string[] = [rule.kind];
    if (rule.kind === "any" || rule.kind === "all") {
      const leaves = await tx.accessRule.findMany({
        where: { id: { in: (rule.params.ruleIds as string[]).map(id => Buffer.from(id, "hex")) } },
        select: { kind: true },
      });
      kinds.push(...leaves.map(leaf => leaf.kind));
    }
    await assertStakeKindsAllowed(ownerUserId, kinds);
    return Buffer.from(access.ruleId, "hex");
  }
  if (access.kind === "any") {
    await assertStakeKindsAllowed(
      ownerUserId,
      access.leaves.map(leaf => leaf.kind)
    );
    const leafIds: string[] = [];
    for (const leaf of access.leaves) {
      leafIds.push(await createRule(ownerUserId, { ...leaf, name: null }, tx));
    }
    const id = await createRule(
      ownerUserId,
      { kind: "any", params: { ruleIds: leafIds }, name: null },
      tx
    );
    return Buffer.from(id, "hex");
  }
  await assertStakeKindsAllowed(ownerUserId, [access.kind]);
  return Buffer.from(await createRule(ownerUserId, { ...access, name: null }, tx), "hex");
}

/** A resource's rule as its owner sees it in the editor, with their own params. */
export async function ownerAccess(ruleId: Uint8Array | null) {
  if (!ruleId) return null;
  const rule = await loadRule(hex(ruleId), { fresh: true });
  if (!rule || rule === "invalid") return { ruleId: hex(ruleId), valid: false as const };
  const row = await prisma.accessRule.findUnique({
    where: { id: Buffer.from(ruleId) },
    select: { name: true },
  });
  const leaves =
    rule.kind === "any" || rule.kind === "all"
      ? await Promise.all(
          (rule.params.ruleIds as string[]).map(async id => {
            const leaf = await loadRule(id, { fresh: true });
            return leaf && leaf !== "invalid"
              ? { ruleId: leaf.id, kind: leaf.kind, params: leaf.params }
              : null;
          })
        )
      : [];
  return {
    ruleId: rule.id,
    valid: true as const,
    kind: rule.kind,
    summary: ACCESS_RULE_SUMMARIES[rule.kind],
    name: row?.name ?? null,
    // G6: the early access date ("Open to everyone on")
    opensToAllAt: rule.opensToAllAt?.toISOString() ?? null,
    params: rule.params,
    leaves: leaves.filter((leaf): leaf is NonNullable<typeof leaf> => leaf !== null),
  };
}

/** The creator's own pool, for Pool fans and Fans with a minimum stake. */
export async function ownerPoolId(userId: number): Promise<number | null> {
  const pool = await prisma.creatorPool.findFirst({
    where: { wallet: { userId }, poolAddress: { not: null } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return pool?.id ?? null;
}
