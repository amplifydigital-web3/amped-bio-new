import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ACCESS_RESOURCE_TYPES, accessRuleInputSchema } from "@repo/constants";
import { privateProcedure, publicProcedure, router, type Context } from "./trpc";
import { env } from "../env";
import {
  check,
  createRule,
  deleteRule,
  listRules,
  updateRule,
  type Viewer,
} from "../services/access";
import { getClientIp } from "../services/analytics/requestContext";
import { enforceRateLimits } from "../utils/rateLimit";

const ruleIdInput = z.string().regex(/^[0-9a-f]{32}$/);
const opensToAllAtInput = z.string().datetime().nullable().optional();

function requireEnabled() {
  if (!env.ACCESS_GATING_ENABLED) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Gating is not available yet." });
  }
}

/** The viewer is always the session account, never client input. */
function viewerFrom(ctx: Context): Viewer {
  return {
    userId: ctx.user?.sub ?? null,
    wallet: ctx.user?.wallet ?? null,
    request: {
      ip: getClientIp(ctx.req),
      userAgent: String(ctx.req.headers["user-agent"] ?? ""),
    },
  };
}

// Access gating engine (Build Board #21, PR G1). Behind ACCESS_GATING_ENABLED.
// Block locks, checkPage, openBlock and /go ship in G3.
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
