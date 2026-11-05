/**
 * Memberships (MB-1, Build Board #25 and #51). Plans for creators, join and cancel for fans,
 * lists for both. Join and cancel are signed in the fan's wallet and sent by the relayer;
 * the server never holds USDC. Everything waits on the checkout feature flag, like PAY-2.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MEMBERSHIP_COPY,
  membershipCancelSubmitSchema,
  membershipIdSchema,
  membershipJoinPrepareSchema,
  membershipJoinSubmitSchema,
  membershipMembersSchema,
  membershipPlanStatusSchema,
  membershipPlanUpsertSchema,
} from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import { getClientIp } from "../services/analytics/requestContext";
import { isFeatureOn } from "../services/featureFlags";
import {
  PlanError,
  getPlan,
  publicPlan,
  setPlanStatus,
  upsertPlan,
} from "../services/memberships/plans";
import {
  joinStatus,
  prepareCancel,
  prepareJoin,
  submitCancel,
  submitJoin,
} from "../services/memberships/core";
import { listMembers, listMine } from "../services/memberships/lists";

function requireCheckout() {
  if (!isFeatureOn("checkout")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout is not available yet." });
  }
}

async function runPlan<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PlanError) {
      const e = MEMBERSHIP_COPY.plan.errors;
      const message =
        error.code === "amount_every_30_days"
          ? e.amountEvery30Days
          : error.code === "amount_yearly"
            ? e.amountYearly
            : error.code === "seller"
              ? e.verifySeller
              : error.code === "policy"
                ? "Publish your store policy again so it includes Memberships."
                : "That change could not be saved.";
      throw new TRPCError({ code: "BAD_REQUEST", message, cause: { refusal: error.code } });
    }
    throw error;
  }
}

export const membershipsRouter = router({
  plan: router({
    get: privateProcedure.query(({ ctx }) => getPlan(ctx.user!.sub)),
    upsert: privateProcedure
      .input(membershipPlanUpsertSchema)
      .mutation(({ ctx, input }) => runPlan(() => upsertPlan(ctx.user!.sub, input))),
    setStatus: privateProcedure
      .input(membershipPlanStatusSchema)
      .mutation(({ ctx, input }) => runPlan(() => setPlanStatus(ctx.user!.sub, input.status))),
  }),

  /** The plan on a store or bio. Not found until the plan is active. */
  public: publicProcedure
    .input(z.object({ handle: z.string().trim().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      await enforceRateLimits(
        [{ key: `membership_public:ip:${getClientIp(ctx.req)}`, limit: 240, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      const plan = await publicPlan(input.handle, ctx.user?.sub ?? null);
      if (!plan)
        throw new TRPCError({ code: "NOT_FOUND", message: MEMBERSHIP_COPY.refusals.not_found });
      return plan;
    }),

  join: router({
    prepare: privateProcedure
      .input(membershipJoinPrepareSchema)
      .mutation(async ({ ctx, input }) => {
        requireCheckout();
        await enforceRateLimits(
          [{ key: `membership_join:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
          "Too many requests. Try again in a minute."
        );
        return prepareJoin(ctx.user!.sub, input);
      }),
    submit: privateProcedure.input(membershipJoinSubmitSchema).mutation(async ({ ctx, input }) => {
      requireCheckout();
      await enforceRateLimits(
        [{ key: `membership_submit:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
        "Too many requests. Try again in a minute."
      );
      return submitJoin(ctx.user!.sub, input);
    }),
    status: privateProcedure.input(membershipIdSchema).query(async ({ ctx, input }) => {
      const status = await joinStatus(ctx.user!.sub, input.membershipId);
      if (!status)
        throw new TRPCError({ code: "NOT_FOUND", message: MEMBERSHIP_COPY.refusals.not_found });
      return status;
    }),
  }),

  /** Cancel works even while payments are paused: a member can always stop the charges. */
  cancel: router({
    prepare: privateProcedure
      .input(membershipIdSchema)
      .mutation(({ ctx, input }) => prepareCancel(ctx.user!.sub, input.membershipId)),
    submit: privateProcedure
      .input(membershipCancelSubmitSchema)
      .mutation(async ({ ctx, input }) => {
        await enforceRateLimits(
          [{ key: `membership_cancel:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
          "Too many requests. Try again in a minute."
        );
        return submitCancel(ctx.user!.sub, input);
      }),
  }),

  mine: privateProcedure.query(({ ctx }) => listMine(ctx.user!.sub)),
  members: privateProcedure
    .input(membershipMembersSchema)
    .query(({ ctx, input }) => listMembers(ctx.user!.sub, input ?? {})),
});
