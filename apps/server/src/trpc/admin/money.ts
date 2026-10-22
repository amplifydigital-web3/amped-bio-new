import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../trpc";
import {
  FundingError,
  fundingEvents,
  moneyOverview,
  recentSends,
  recordFunding,
  screeningDenies,
  setSendsPaused,
} from "../../services/usdc/admin";

/**
 * Admin, Money (Build Board #29 USDC-3, spec 3.8): the USDC relayer, its gas
 * ledger and funding, sends against the limits, screening denies, and the
 * Pause USDC sends switch. Admin only. Handles, never fan email or names.
 */
export const moneyAdminRouter = router({
  overview: adminProcedure.query(() => moneyOverview()),

  sends: adminProcedure
    .input(
      z.object({
        status: z
          .enum([
            "screened",
            "submitting",
            "submitted",
            "confirmed",
            "failed",
            "refused",
            "expired",
          ])
          .optional(),
        limit: z.number().int().min(1).max(100).default(25),
        before: z.string().datetime().optional(),
      })
    )
    .query(({ input }) =>
      recentSends({
        status: input.status,
        limit: input.limit,
        before: input.before ? new Date(input.before) : undefined,
      })
    ),

  screeningDenies: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }))
    .query(({ input }) => screeningDenies(input.limit)),

  fundingEvents: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }))
    .query(({ input }) => fundingEvents(input.limit)),

  recordFunding: adminProcedure
    .input(
      z.object({
        txHash: z.string().trim().min(1).max(80),
        note: z.string().trim().max(255).optional(),
        amountEth: z.string().trim().max(40).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordFunding({ ...input, adminUserId: ctx.user!.sub });
      } catch (error) {
        if (error instanceof FundingError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  setPaused: adminProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(({ input }) => setSendsPaused(input.paused)),
});
