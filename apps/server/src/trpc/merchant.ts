import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { privateProcedure, router } from "./trpc";
import { assertTwoFactorCode } from "../services/payments/twoFactor";
import {
  PayoutWalletError,
  approvePayoutWallet,
  proofChallenge,
  proposePayoutWallet,
  rejectPayoutWallet,
} from "../services/merchants/payoutWallets";

/**
 * Merchant members (Build Board #66, AB-1; spec 3.8, decision M2). The Merchant Console
 * (AB-5) calls these. Every call checks the caller is a member of that merchant; payout
 * wallet changes need an Owner and a fresh two factor code.
 */

const hexId = z
  .string()
  .regex(/^[0-9a-f]{32}$/i)
  .transform(value => Buffer.from(value, "hex"));
const code = z.string().trim().max(12);

function asTrpc(error: unknown): never {
  if (error instanceof PayoutWalletError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

async function requireMember(merchantId: Buffer, userId: number) {
  const member = await prisma.merchantMember.findUnique({
    where: { merchantId_userId: { merchantId, userId } },
    select: { role: true },
  });
  // Not a member reads the same as an unknown merchant
  if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found." });
  return member.role;
}

export const merchantRouter = router({
  mine: privateProcedure.query(async ({ ctx }) => {
    const rows = await prisma.merchantMember.findMany({
      where: { userId: ctx.user!.sub },
      select: {
        role: true,
        merchant: { select: { id: true, slug: true, name: true, status: true } },
      },
    });
    return rows.map(r => ({
      id: Buffer.from(r.merchant.id).toString("hex"),
      slug: r.merchant.slug,
      name: r.merchant.name,
      status: r.merchant.status,
      role: r.role,
    }));
  }),

  payoutWallet: router({
    challenge: privateProcedure
      .input(
        z.object({ merchantId: z.string().regex(/^[0-9a-f]{32}$/i), address: z.string().max(42) })
      )
      .mutation(async ({ ctx, input }) => {
        await requireMember(Buffer.from(input.merchantId, "hex"), ctx.user!.sub);
        try {
          return { message: await proofChallenge(input.merchantId.toLowerCase(), input.address) };
        } catch (error) {
          asTrpc(error);
        }
      }),

    propose: privateProcedure
      .input(
        z.object({
          merchantId: hexId,
          address: z.string().max(42),
          message: z.string().max(500),
          signature: z
            .string()
            .regex(/^0x[0-9a-fA-F]+$/)
            .max(20_000),
          code,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireMember(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          const row = await proposePayoutWallet({
            merchantId: input.merchantId,
            userId: ctx.user!.sub,
            address: input.address,
            message: input.message,
            signature: input.signature as `0x${string}`,
          });
          return { id: Buffer.from(row.id).toString("hex") };
        } catch (error) {
          asTrpc(error);
        }
      }),

    approve: privateProcedure
      .input(z.object({ merchantId: hexId, walletId: hexId, code }))
      .mutation(async ({ ctx, input }) => {
        await requireMember(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          const { effectiveAt } = await approvePayoutWallet({
            merchantId: input.merchantId,
            walletId: input.walletId,
            userId: ctx.user!.sub,
          });
          return { effectiveAt: effectiveAt.toISOString() };
        } catch (error) {
          asTrpc(error);
        }
      }),

    reject: privateProcedure
      .input(z.object({ merchantId: hexId, walletId: hexId, code }))
      .mutation(async ({ ctx, input }) => {
        await requireMember(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          await rejectPayoutWallet({
            merchantId: input.merchantId,
            walletId: input.walletId,
            userId: ctx.user!.sub,
          });
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
  }),
});
