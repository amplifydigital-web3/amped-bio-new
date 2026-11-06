import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ADMIN_CHANGE_REASON_MAX, MERCHANT_ROLES } from "@repo/constants";
import { adminProcedure, router } from "../trpc";
import { hasPaymentsAdminRole } from "../../services/payments/overview";
import { assertTwoFactorCode } from "../../services/payments/twoFactor";
import {
  MerchantAdminError,
  addMerchantMember,
  approveMerchantChange,
  createMerchant,
  draftMerchantChange,
  listMerchants,
  merchantDetail,
  recordBusinessCheck,
  rejectMerchantChange,
} from "../../services/merchants/admin";

/**
 * Admin, Money, Merchants (Build Board #66, AB-1; board a1; docs/features/authbase-storefront.md
 * 3.2 and 3.8). Every admin reads. A payments admin with a fresh two factor code creates a
 * merchant, sets members and records the business check. Turning a merchant on or off and its
 * fee follow the two person rule: a second payments admin approves (M1, M3).
 */

const paymentsAdminProcedure = adminProcedure.use(({ ctx, next }) => {
  if (!hasPaymentsAdminRole(ctx.user?.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a payments admin can change merchants.",
    });
  }
  return next();
});

const code = z.string().trim().max(12);
const reason = z.string().trim().min(3).max(ADMIN_CHANGE_REASON_MAX);
const hexId = z
  .string()
  .regex(/^[0-9a-f]{32}$/i)
  .transform(value => Buffer.from(value, "hex"));

function asTrpc(error: unknown): never {
  if (error instanceof MerchantAdminError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    asTrpc(error);
  }
}

export const merchantsAdminRouter = router({
  list: adminProcedure.query(() => listMerchants()),

  get: adminProcedure
    .input(z.object({ id: hexId }))
    .query(({ input }) => run(() => merchantDetail(input.id))),

  create: paymentsAdminProcedure
    .input(z.object({ slug: z.string().trim().max(40), name: z.string().trim().max(80), code }))
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      return run(() =>
        createMerchant({ userId: ctx.user!.sub, slug: input.slug, name: input.name })
      );
    }),

  setMember: paymentsAdminProcedure
    .input(
      z.object({
        id: hexId,
        userId: z.number().int().positive(),
        role: z.enum(MERCHANT_ROLES),
        code,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      return run(() =>
        addMerchantMember({
          adminUserId: ctx.user!.sub,
          merchantId: input.id,
          userId: input.userId,
          role: input.role,
        })
      );
    }),

  recordBusinessCheck: paymentsAdminProcedure
    .input(
      z.object({
        id: hexId,
        registration: z.boolean(),
        beneficialOwners: z.boolean(),
        sanctionsScreen: z.boolean(),
        notes: z.string().trim().max(1000).optional(),
        code,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      return run(() =>
        recordBusinessCheck({
          adminUserId: ctx.user!.sub,
          merchantId: input.id,
          check: {
            registration: input.registration,
            beneficialOwners: input.beneficialOwners,
            sanctionsScreen: input.sanctionsScreen,
            ...(input.notes ? { notes: input.notes } : {}),
          },
        })
      );
    }),

  draft: paymentsAdminProcedure
    .input(
      z.object({
        id: hexId,
        field: z.enum(["status", "fee_bps"]),
        value: z.string().trim().max(16),
        reason,
        code,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      const change = await run(() =>
        draftMerchantChange({
          userId: ctx.user!.sub,
          merchantId: input.id,
          field: input.field,
          newValue: input.value,
          reason: input.reason,
        })
      );
      return { id: Buffer.from(change.id).toString("hex"), status: change.status };
    }),

  approve: paymentsAdminProcedure
    .input(z.object({ changeId: hexId, code }))
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      return run(() => approveMerchantChange({ userId: ctx.user!.sub, changeId: input.changeId }));
    }),

  reject: paymentsAdminProcedure
    .input(z.object({ changeId: hexId, note: reason, code }))
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      return run(() =>
        rejectMerchantChange({ userId: ctx.user!.sub, changeId: input.changeId, note: input.note })
      );
    }),
});
