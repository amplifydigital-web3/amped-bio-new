import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ADMIN_CHANGE_REASON_MAX } from "@repo/constants";
import { adminProcedure, router } from "../trpc";
import { checkIdentity } from "../../services/identity/checks";
import { hasPaymentsAdminRole } from "../../services/payments/overview";
import { assertTwoFactorCode } from "../../services/payments/twoFactor";
import {
  SellerOverrideError,
  revokeSellerOverride,
  sellerOverrideView,
  setSellerOverride,
} from "../../services/identity/sellerOverride";

/**
 * Admin, Users, Seller check (Build Board #66, AB-6, board a2; spec 3.2b, decision M10).
 * Every admin reads. A payments admin with a fresh two factor code allows a named creator to
 * sell with Standard until a date, with a reason, or ends it. Each write is a row in the
 * payments change log (area identity).
 */

const paymentsAdminProcedure = adminProcedure.use(({ ctx, next }) => {
  if (!hasPaymentsAdminRole(ctx.user?.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a payments admin can set a seller override.",
    });
  }
  return next();
});

const reason = z.string().trim().min(3).max(ADMIN_CHANGE_REASON_MAX);
const code = z.string().trim().max(12);

function asTrpc(error: unknown): never {
  if (error instanceof SellerOverrideError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const sellerChecksAdminRouter = router({
  get: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [view, seller] = await Promise.all([
        sellerOverrideView(input.userId),
        checkIdentity(input.userId, "seller"),
      ]);
      return {
        ...view,
        seller: seller.pass
          ? { pass: true as const, tier: seller.tier, validUntil: seller.validUntil.toISOString() }
          : { pass: false as const, reason: seller.reason },
      };
    }),

  set: paymentsAdminProcedure
    .input(
      z.object({ userId: z.number().int().positive(), endsAt: z.string().datetime(), reason, code })
    )
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      try {
        const row = await setSellerOverride({
          adminUserId: ctx.user!.sub,
          userId: input.userId,
          reason: input.reason,
          endsAt: new Date(input.endsAt),
        });
        return { endsAt: row.endsAt.toISOString() };
      } catch (error) {
        asTrpc(error);
      }
    }),

  end: paymentsAdminProcedure
    .input(z.object({ userId: z.number().int().positive(), reason, code }))
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      try {
        await revokeSellerOverride({
          adminUserId: ctx.user!.sub,
          userId: input.userId,
          reason: input.reason,
        });
        return { ok: true };
      } catch (error) {
        asTrpc(error);
      }
    }),
});
