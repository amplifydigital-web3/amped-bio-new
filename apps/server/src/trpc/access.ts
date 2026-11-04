import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ACCESS_RESOURCE_TYPES,
  accessCheckPageSchema,
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
// checkPage (content cards) ships in C8; block locks, openBlock and /go in G3.
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
   * dropped from the answer. Content only in C8; G3 adds blocks. One rate limit
   * hit per call, not per resource.
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
    const ids = [
      ...new Set(input.resources.filter(r => r.type === "content").map(r => r.id)),
    ].slice(0, 48);
    if (!ids.length) return out;
    const owned = await prisma.contentItem.findMany({
      where: { userId: creator.id, publicId: { in: ids } },
      select: { publicId: true },
    });
    const decisions = await checkBatch(
      viewer,
      owned.map(item => ({ type: "content" as const, id: item.publicId })),
      { intent: "render" }
    );
    for (const [key, decision] of decisions) out[key] = decision;
    return out;
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
