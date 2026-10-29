import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ADMIN_CHANGE_REASON_MAX, PAYMENT_ITEM_BY_ID } from "@repo/constants";
import { adminProcedure, router } from "../trpc";
import {
  AdminChangeError,
  approveChange,
  draftChange,
  exportChanges,
  listChanges,
  pausePayments,
  rejectChange,
  settingsView,
} from "../../services/payments/changes";
import {
  hasPaymentsAdminRole,
  paymentsOverview,
  paymentsViewer,
} from "../../services/payments/overview";
import { assertTwoFactorCode } from "../../services/payments/twoFactor";

/**
 * Admin, Payments (Build Board #50, spec docs/features/ampedpay.md 3.5, 3.8, 3.9).
 * Every admin reads every value (acceptance 8). Only a payments_admin changes one, with a
 * fresh two factor code, and a second payments_admin approves it (acceptance 4). Pause
 * applies at once; Resume follows the two person rule.
 */

const paymentsAdminProcedure = adminProcedure.use(({ ctx, next }) => {
  if (!hasPaymentsAdminRole(ctx.user?.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a payments admin can change payment settings.",
    });
  }
  return next();
});

const code = z.string().trim().max(12);
const reason = z.string().trim().min(3).max(ADMIN_CHANGE_REASON_MAX);
const changeId = z
  .string()
  .regex(/^[0-9a-f]{32}$/i)
  .transform(value => Buffer.from(value, "hex"));

function asTrpc(error: unknown): never {
  if (error instanceof AdminChangeError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const paymentsAdminRouter = router({
  viewer: adminProcedure.query(({ ctx }) => paymentsViewer(ctx.user!.sub, ctx.user!.role)),

  overview: adminProcedure.query(() => paymentsOverview()),

  settings: adminProcedure.query(() => settingsView()),

  changes: router({
    list: adminProcedure
      .input(
        z.object({
          filter: z.enum(["all", "waiting", "applied", "closed"]).default("all"),
          target: z.enum(["server", "contract"]).optional(),
          limit: z.number().int().min(1).max(100).default(50),
          before: z.string().datetime().optional(),
        })
      )
      .query(({ input }) =>
        listChanges({
          filter: input.filter,
          ...(input.target ? { target: input.target } : {}),
          limit: input.limit,
          ...(input.before ? { before: new Date(input.before) } : {}),
        })
      ),

    export: adminProcedure.query(() => exportChanges()),

    draft: paymentsAdminProcedure
      .input(
        z.object({
          key: z.string().refine(key => !!PAYMENT_ITEM_BY_ID[key], "Unknown setting"),
          value: z.string().trim().max(1024),
          reason,
          effectiveAt: z.string().datetime().nullable().optional(),
          code,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          const change = await draftChange({
            userId: ctx.user!.sub,
            itemId: input.key,
            newValue: input.value,
            reason: input.reason,
            effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
          });
          return { id: Buffer.from(change.id).toString("hex"), status: change.status };
        } catch (error) {
          asTrpc(error);
        }
      }),

    approve: paymentsAdminProcedure
      .input(z.object({ id: changeId, code }))
      .mutation(async ({ ctx, input }) => {
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          return await approveChange({ userId: ctx.user!.sub, changeId: input.id });
        } catch (error) {
          asTrpc(error);
        }
      }),

    reject: paymentsAdminProcedure
      .input(z.object({ id: changeId, note: reason, code }))
      .mutation(async ({ ctx, input }) => {
        await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
        try {
          return await rejectChange({
            userId: ctx.user!.sub,
            changeId: input.id,
            note: input.note,
          });
        } catch (error) {
          asTrpc(error);
        }
      }),
  }),

  pause: paymentsAdminProcedure
    .input(z.object({ reason, code }))
    .mutation(async ({ ctx, input }) => {
      await assertTwoFactorCode(ctx.user!.sub, input.code, ctx.req.headers);
      try {
        return await pausePayments({ userId: ctx.user!.sub, reason: input.reason });
      } catch (error) {
        asTrpc(error);
      }
    }),
});
