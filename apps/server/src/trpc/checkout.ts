import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { checkoutIntentIdSchema, checkoutStartInputSchema } from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { env } from "../env";
import { getIntent, resumableIntent, startIntent } from "../services/checkout/intents";
import { getClientIp } from "../services/analytics/requestContext";
import { enforceRateLimits } from "../utils/rateLimit";

function requireEnabled() {
  if (!env.CHECKOUT_ENABLED) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkout is not available yet." });
  }
}

// Checkout intents (Build Board #49, PR CK-1). Behind CHECKOUT_ENABLED. The pay
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

  // The resume bar on app load: Finish buying {item}
  resumable: privateProcedure.query(async ({ ctx }) => {
    if (!env.CHECKOUT_ENABLED) return null;
    return resumableIntent(ctx.user!.sub);
  }),
});
