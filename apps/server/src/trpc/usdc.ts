import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { privateProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import {
  SendInputError,
  markUsdcWalletSeen,
  prepareUsdcSend,
  submitUsdcSend,
  usdcSendStatus,
} from "../services/usdc";
import { paymentChain } from "../services/usdc/chain";

/**
 * USDC in the wallet (Build Board #29), spec 3.5. Mounted at the root as
 * usdc.send.* (the spec's wallet.sendUsdc.*) and usdc.seen and usdc.activity,
 * so the large wallet router stays untouched. Every input is validated here;
 * the services re-check the money rules (pause, limits, screening, signature).
 */

function asInputError(error: unknown): never {
  if (error instanceof SendInputError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

const sendId = z.string().regex(/^[0-9a-f]{32}$/);

const usdcSendRouter = router({
  prepare: privateProcedure
    .input(
      z.object({
        to: z.string().trim().min(1).max(64),
        amount: z.string().trim().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `usdc:prepare:${userId}`, limit: 30, windowSeconds: 3600 }],
        "Too many send attempts. Try again in a few minutes."
      );
      return prepareUsdcSend(userId, input).catch(asInputError);
    }),

  submit: privateProcedure
    .input(
      z.object({
        sendId,
        signature: z.string().regex(/^0x[0-9a-fA-F]{128,130}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return submitUsdcSend(ctx.user!.sub, {
        sendId: input.sendId,
        signature: input.signature as `0x${string}`,
      }).catch(asInputError);
    }),

  status: privateProcedure.input(z.object({ sendId })).query(async ({ ctx, input }) => {
    return usdcSendStatus(ctx.user!.sub, input.sendId).catch(asInputError);
  }),
});

export const usdcRouter = router({
  send: usdcSendRouter,

  /** The fan opened USDC on Base: start indexing the address and screen it once. */
  seen: privateProcedure.mutation(async ({ ctx }) => markUsdcWalletSeen(ctx.user!.sub)),

  /** USDC transfers for Activity, newest first (spec 3.6). Both sides of a member to member send see the row. */
  activity: privateProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(25) }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const rows = await prisma.paymentEvent.findMany({
        where: {
          chainId: paymentChain.id,
          kind: "usdc_transfer",
          OR: [{ payerUserId: userId }, { payeeUserId: userId }],
        },
        orderBy: { occurredAt: "desc" },
        take: input?.limit ?? 25,
      });
      return rows.map(row => ({
        txHash: row.txHash,
        logIndex: row.logIndex,
        direction: row.payerUserId === userId ? ("out" as const) : ("in" as const),
        from: row.fromAddress,
        to: row.toAddress,
        amount: row.amount.toString(),
        occurredAt: row.occurredAt.toISOString(),
        chainId: row.chainId,
      }));
    }),
});
