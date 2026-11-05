import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  checkoutIntentIdSchema,
  purchaseIdSchema,
  purchasePrepareInputSchema,
  purchaseSubmitInputSchema,
} from "@repo/constants";
import { privateProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import { isFeatureOn } from "../services/featureFlags";
import {
  PurchaseInputError,
  preparePurchase,
  purchaseForIntent,
  purchaseStatus,
  submitPurchase,
} from "../services/payments/purchases";

function requireEnabled() {
  if (!isFeatureOn("checkout")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout is not available yet." });
  }
}

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof PurchaseInputError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}

// AmpedPay purchases (PAY-2; content spec 3.9 steps 2 to 5). Behind the checkout flag. The pay
// sheet (CK-5) calls prepare on Pay, has the fan sign the returned typed data, calls submit,
// then polls status until unlocked.
export const paymentsRouter = router({
  pay: router({
    prepare: privateProcedure.input(purchasePrepareInputSchema).mutation(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `payments_prepare:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
        "Too many payments started. Try again in a minute."
      );
      return run(() => preparePurchase(ctx.user!.sub, input));
    }),

    submit: privateProcedure.input(purchaseSubmitInputSchema).mutation(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `payments_submit:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
        "Too many payments sent. Try again in a minute."
      );
      return run(() => submitPurchase(ctx.user!.sub, input));
    }),
  }),

  status: privateProcedure
    .input(z.object({ purchaseId: purchaseIdSchema }))
    .query(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `payments_status:u:${ctx.user!.sub}`, limit: 120, windowSeconds: 60 }],
        "Too many checks. Try again in a minute."
      );
      return run(() => purchaseStatus(ctx.user!.sub, input.purchaseId));
    }),

  // CK-5: the purchase behind an intent, for Checking on a return to the sheet
  forIntent: privateProcedure
    .input(z.object({ intentId: checkoutIntentIdSchema }))
    .query(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `payments_status:u:${ctx.user!.sub}`, limit: 120, windowSeconds: 60 }],
        "Too many checks. Try again in a minute."
      );
      return run(() => purchaseForIntent(ctx.user!.sub, input.intentId));
    }),
});
