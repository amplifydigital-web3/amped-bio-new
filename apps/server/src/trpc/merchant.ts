import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import { OFFER_PLACEMENTS } from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { storefront } from "../services/merchants/offers";
import { ApiKeyError, createApiKey, listApiKeys, revokeApiKey } from "../services/partners/keys";
import {
  WEBHOOK_EVENTS,
  WebhookError,
  addEndpoint,
  disableEndpoint,
  emitMerchantEvent,
  listDeliveries,
  listEndpoints,
  replayDelivery,
  rotateSecret,
} from "../services/partners/webhooks";
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
  if (
    error instanceof PayoutWalletError ||
    error instanceof ApiKeyError ||
    error instanceof WebhookError
  ) {
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

/** Developers and Owners manage keys and webhooks (Console p5, spec 3.8). */
async function requireDeveloper(merchantId: Buffer, userId: number) {
  const role = await requireMember(merchantId, userId);
  if (role !== "owner" && role !== "developer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an Owner or a Developer can do this.",
    });
  }
}

const developerInput = z.object({ merchantId: hexId });

export const merchantRouter = router({
  // AB-4: Console Developers (board p5). Keys and secrets are shown once
  developers: router({
    view: privateProcedure.input(developerInput).query(async ({ ctx, input }) => {
      await requireDeveloper(input.merchantId, ctx.user!.sub);
      const [keys, endpoints, deliveries] = await Promise.all([
        listApiKeys(input.merchantId),
        listEndpoints(input.merchantId),
        listDeliveries(input.merchantId),
      ]);
      return { keys, endpoints, deliveries };
    }),
    createKey: privateProcedure
      .input(
        z.object({
          merchantId: hexId,
          name: z.string().trim().max(60),
          mode: z.enum(["test", "live"]),
          code,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          return await createApiKey({
            merchantId: input.merchantId,
            actorId: ctx.user!.sub,
            name: input.name,
            mode: input.mode,
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
    revokeKey: privateProcedure
      .input(z.object({ merchantId: hexId, keyId: hexId }))
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        try {
          await revokeApiKey(input.merchantId, input.keyId, ctx.user!.sub);
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
    addEndpoint: privateProcedure
      .input(
        z.object({
          merchantId: hexId,
          url: z.string().max(500),
          events: z.array(z.enum(WEBHOOK_EVENTS)).optional(),
          code,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          return await addEndpoint({
            merchantId: input.merchantId,
            actorId: ctx.user!.sub,
            url: input.url,
            ...(input.events ? { events: input.events } : {}),
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
    rotateSecret: privateProcedure
      .input(z.object({ merchantId: hexId, endpointId: hexId, code }))
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          return await rotateSecret(input.merchantId, input.endpointId, ctx.user!.sub);
        } catch (error) {
          asTrpc(error);
        }
      }),
    disableEndpoint: privateProcedure
      .input(z.object({ merchantId: hexId, endpointId: hexId }))
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        try {
          await disableEndpoint(input.merchantId, input.endpointId, ctx.user!.sub);
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
    replay: privateProcedure
      .input(z.object({ merchantId: hexId, deliveryId: hexId }))
      .mutation(async ({ ctx, input }) => {
        await requireDeveloper(input.merchantId, ctx.user!.sub);
        try {
          await replayDelivery(input.merchantId, input.deliveryId);
          return { ok: true };
        } catch (error) {
          asTrpc(error);
        }
      }),
    // Console Send a test order: a signed order.paid with test data and no payment (partner spec 14)
    sendTestOrder: privateProcedure.input(developerInput).mutation(async ({ ctx, input }) => {
      await requireDeveloper(input.merchantId, ctx.user!.sub);
      const queued = await emitMerchantEvent(input.merchantId, "order.paid", {
        test: true,
        order: {
          order_ref: "00000000000000000000000000000000",
          merchant_id: input.merchantId.toString("hex"),
          status: "paid",
          product_code: "STANDARD",
          amount_units: "1000000",
          amped_user_id: String(ctx.user!.sub),
          fulfillment_state: "paid",
        },
      });
      return { queued };
    }),
  }),

  // AB-2: the Identity tab storefront (boards s1 to s4). Null while the flag is off
  storefront: publicProcedure
    .input(z.object({ placement: z.enum(OFFER_PLACEMENTS) }))
    .query(({ ctx, input }) => storefront(input.placement, ctx.user?.sub ?? null)),

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
