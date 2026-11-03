import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ACCESS_RESOURCE_TYPES,
  ACCESS_CHECK_PAGE_MAX,
  accessCheckPageSchema,
  blockOpenSchema,
  type AccessDecision,
  type BlockReveal,
  accessRuleInputSchema,
  type AccessCheckPageResult,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { env } from "../env";
import {
  check,
  checkBatch,
  createRule,
  deleteRule,
  listRules,
  updateRule,
  viewerFrom,
} from "../services/access";
import { findPublicCreator } from "../services/content/publicView";
import { open } from "../services/access";
import { isLockable } from "../services/access/blocks";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";

/** The block's own config, built only inside a pass (G3). */
async function revealBlock(blockId: number): Promise<BlockReveal | null> {
  const row = await prisma.block.findUnique({ where: { id: blockId } });
  if (!row || !isLockable(row.type)) return null;
  const config = sanitizeBlockConfig(row.type, row.config) as Record<string, unknown>;
  const str = (key: string) => (typeof config[key] === "string" ? (config[key] as string) : "");
  if (row.type === "link") {
    return { kind: "link", url: str("url"), label: str("label"), platform: str("platform") };
  }
  if (row.type === "text")
    return { kind: "text", content: str("content"), platform: str("platform") };
  return {
    kind: "media",
    url: str("url"),
    label: str("label"),
    platform: str("platform"),
    ...(str("content") ? { content: str("content") } : {}),
  };
}
import { enforceRateLimits } from "../utils/rateLimit";
import { isFeatureOn } from "../services/featureFlags";

const ruleIdInput = z.string().regex(/^[0-9a-f]{32}$/);
const opensToAllAtInput = z.string().datetime().nullable().optional();

function requireEnabled() {
  if (!isFeatureOn("accessGating")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gating is not available yet." });
  }
}

// Access gating engine (Build Board #21, PR G1). Behind the accessGating feature flag.
// checkPage ships in C8 (content) and G3 (blocks); openBlock and /go in G3.
export const accessRouter = router({
  // One decision. Public procedures return not_signed_in for anonymous viewers on
  // any kind but public.
  check: publicProcedure
    .input(
      z.object({
        resource: z.object({ type: z.enum(ACCESS_RESOURCE_TYPES), id: z.string().min(1).max(64) }),
        intent: z.enum(["render", "open"]).default("render"),
      })
    )
    .query(async ({ ctx, input }) => {
      requireEnabled();
      const viewer = viewerFrom(ctx);
      const key = viewer.userId !== null ? `u:${viewer.userId}` : `ip:${viewer.request!.ip}`;
      await enforceRateLimits(
        [{ key: `access_check:${key}`, limit: 30, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      return check(viewer, input.resource, { intent: input.intent });
    }),

  /**
   * Decisions for the cards on one creator's page (content gating 3.4, CQ2).
   * Up to 48 resources, all owned by the handle's user: any other resource is
   * dropped from the answer. Content cards (C8) and blocks (G3). One rate
   * limit hit per call, not per resource.
   */
  checkPage: publicProcedure.input(accessCheckPageSchema).query(async ({ ctx, input }) => {
    requireEnabled();
    const viewer = viewerFrom(ctx);
    const key = viewer.userId !== null ? `u:${viewer.userId}` : `ip:${viewer.request!.ip}`;
    await enforceRateLimits(
      [{ key: `access_check_page:${key}`, limit: 30, windowSeconds: 60 }],
      "Too many requests. Try again in a minute."
    );
    const out: AccessCheckPageResult = {};
    const creator = await findPublicCreator(input.handle);
    if (!creator) return out;
    // At most 48 resources in all, content and blocks together
    const wanted = Array.from(
      new Map(
        input.resources
          .filter(r => r.type === "content" || (r.type === "block" && /^\d{1,10}$/.test(r.id)))
          .map(r => [`${r.type}:${r.id}`, r])
      ).values()
    ).slice(0, ACCESS_CHECK_PAGE_MAX);
    const contentIds = wanted.filter(r => r.type === "content").map(r => r.id);
    const blockIds = wanted.filter(r => r.type === "block").map(r => Number(r.id));
    if (!wanted.length) return out;
    const [items, blocks] = await Promise.all([
      contentIds.length
        ? prisma.contentItem.findMany({
            where: { userId: creator.id, publicId: { in: contentIds } },
            select: { publicId: true },
          })
        : Promise.resolve([]),
      blockIds.length
        ? prisma.block.findMany({
            where: { user_id: creator.id, id: { in: blockIds } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    const decisions = await checkBatch(
      viewer,
      [
        ...items.map(item => ({ type: "content" as const, id: item.publicId })),
        ...blocks.map(block => ({ type: "block" as const, id: String(block.id) })),
      ],
      { intent: "render" }
    );
    for (const [key, decision] of decisions) out[key] = decision;
    return out;
  }),

  /**
   * The body of a gated link, text or media block, through open (G3, spec 3.7).
   * A refusal returns the decision so the page can show the unlock sheet;
   * not_found answers NOT_FOUND. Links on the page open through /go/:blockId.
   */
  openBlock: publicProcedure.input(blockOpenSchema).query(async ({ ctx, input }) => {
    requireEnabled();
    const viewer = viewerFrom(ctx);
    const key = viewer.userId !== null ? `u:${viewer.userId}` : `ip:${viewer.request!.ip}`;
    await enforceRateLimits(
      [{ key: `access_open:${key}`, limit: 30, windowSeconds: 60 }],
      "Too many requests. Try again in a minute."
    );
    const { decision, value } = await open(
      viewer,
      { type: "block", id: String(input.blockId) },
      async () => revealBlock(input.blockId)
    );
    if (decision.reason === "not_found" || (decision.allowed && !value)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "This block is not available." });
    }
    return {
      decision: decision as AccessDecision,
      block: decision.allowed ? (value as BlockReveal) : null,
    };
  }),

  rules: router({
    list: privateProcedure.query(async ({ ctx }) => {
      requireEnabled();
      return listRules(ctx.user!.sub);
    }),

    create: privateProcedure
      .input(
        z.object({
          rule: accessRuleInputSchema,
          name: z.string().trim().min(1).max(80).nullable().optional(),
          opensToAllAt: opensToAllAtInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        const id = await createRule(ctx.user!.sub, {
          ...input.rule,
          name: input.name ?? null,
          opensToAllAt: input.opensToAllAt ? new Date(input.opensToAllAt) : null,
        });
        return { id };
      }),

    update: privateProcedure
      .input(
        z.object({
          id: ruleIdInput,
          name: z.string().trim().min(1).max(80).nullable().optional(),
          opensToAllAt: opensToAllAtInput,
          rule: accessRuleInputSchema.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        await updateRule(ctx.user!.sub, input.id, {
          name: input.name,
          opensToAllAt:
            input.opensToAllAt === undefined
              ? undefined
              : input.opensToAllAt
                ? new Date(input.opensToAllAt)
                : null,
          input: input.rule,
        });
        return { ok: true };
      }),

    delete: privateProcedure
      .input(z.object({ id: ruleIdInput }))
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        await deleteRule(ctx.user!.sub, input.id);
        return { ok: true };
      }),
  }),
});
