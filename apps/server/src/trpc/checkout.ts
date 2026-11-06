import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkoutIntentIdSchema, checkoutStartInputSchema } from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { env } from "../env";
import { getIntent, resumableIntent, startIntent } from "../services/checkout/intents";
import { quoteIntent } from "../services/checkout/quote";
import { awaitFunds } from "../services/checkout/funds";
import { getClientIp } from "../services/analytics/requestContext";
import { enforceRateLimits } from "../utils/rateLimit";
import { isFeatureOn } from "../services/featureFlags";

function requireEnabled() {
  if (!isFeatureOn("checkout")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout is not available yet." });
  }
}

// Checkout intents (Build Board #49, PR CK-1). Behind the checkout feature flag. The pay
// page (CK-2) reads an intent with get; Buy and Join call start.
export const checkoutRouter = router({
  // Buy, Join, Renew and Tip: works signed out, so a public page can start it
  start: publicProcedure.input(checkoutStartInputSchema).mutation(async ({ ctx, input }) => {
    requireEnabled();
    const key = ctx.user ? `u:${ctx.user.sub}` : `ip:${getClientIp(ctx.req)}`;
    await enforceRateLimits(
      [{ key: `checkout_start:${key}`, limit: 20, windowSeconds: 60 }],
      "Too many checkouts started. Try again in a minute."
    );
    return startIntent(ctx.user?.sub ?? null, input);
  }),

  // The pay page. The first signed in reader claims the intent
  get: publicProcedure
    .input(z.object({ id: checkoutIntentIdSchema }))
    .query(async ({ ctx, input }) => {
      requireEnabled();
      return getIntent(ctx.user?.sub ?? null, input.id);
    }),

  // The pay sheet (CK-2): item, creator look, amount, fee and whether payment can go
  // ahead. Called on every open so a changed price shows before Pay. Claimed fan only
  quote: privateProcedure
    .input(z.object({ id: checkoutIntentIdSchema }))
    .query(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `checkout_quote:u:${ctx.user!.sub}`, limit: 60, windowSeconds: 60 }],
        "Too many checks. Try again in a minute."
      );
      return quoteIntent(ctx.user!.sub, input.id);
    }),

  // Add USDC in Wallet (CK-3): the intent waits for funds. Claimed fan only
  awaitFunds: privateProcedure
    .input(z.object({ id: checkoutIntentIdSchema }))
    .mutation(async ({ ctx, input }) => {
      requireEnabled();
      await enforceRateLimits(
        [{ key: `checkout_await:u:${ctx.user!.sub}`, limit: 20, windowSeconds: 60 }],
        "Too many checks. Try again in a minute."
      );
      return awaitFunds(ctx.user!.sub, input.id);
    }),

  // The resume bar on app load: Finish buying {item}
  resumable: privateProcedure.query(async ({ ctx }) => {
    if (!isFeatureOn("checkout")) return null;
    return resumableIntent(ctx.user!.sub);
  }),
});
