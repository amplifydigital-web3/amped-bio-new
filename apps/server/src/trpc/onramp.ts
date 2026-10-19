import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { privateProcedure, router } from "./trpc";
import { enforceRateLimits } from "../utils/rateLimit";
import {
  OnrampInputError,
  OnrampProviderError,
  cancelOnrampSession,
  clientIpFromRequest,
  createCoinbaseSession,
  createWalletPayOrder,
  onrampFrameEvent,
  onrampOptions,
  onrampQuote,
  onrampStatus,
  parseFiatInput,
  regionFromRequest,
  type OnrampRegion,
} from "../services/onramp";

/**
 * Buy USDC through Coinbase (Build Board #5), spec 3.5. Mounted at the root as
 * onramp.*. Coinbase quotes, sells, verifies and delivers; these procedures ask
 * it, record what it said and report arrival. Nothing here charges the fan.
 */

function asClientError(error: unknown): never {
  if (error instanceof OnrampInputError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof OnrampProviderError) {
    throw new TRPCError({
      code: error.code === "rate_limited" ? "TOO_MANY_REQUESTS" : "BAD_GATEWAY",
      message: error.message,
    });
  }
  throw error;
}

const regionInput = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  subdivision: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,3}$/)
    .nullable()
    .optional(),
});

function region(input: z.infer<typeof regionInput>): OnrampRegion {
  return { country: input.country, subdivision: input.subdivision ?? null };
}

function cents(amount: string): number {
  const value = parseFiatInput(amount);
  if (value === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter an amount with up to 2 decimals." });
  }
  return value;
}

const sessionId = z.string().regex(/^[0-9a-f]{32}$/);
const mode = z.enum(["coinbase_account", "apple_pay", "google_pay"]);

export const onrampRouter = router({
  /** Ways to pay and Coinbase's limits for the fan's region (detected, or the one they picked). */
  options: privateProcedure
    .input(z.object({ region: regionInput.nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const detected = await regionFromRequest(ctx.req);
      return onrampOptions(detected, input?.region ? region(input.region) : null).catch(
        asClientError
      );
    }),

  /** Coinbase's quote for the amount (o1). Never a figure Amped.Bio computed. */
  quote: privateProcedure
    .input(z.object({ amount: z.string().trim().min(1).max(12), mode, region: regionInput }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      return onrampQuote(userId, {
        cents: cents(input.amount),
        mode: input.mode,
        region: region(input.region),
      }).catch(asClientError);
    }),

  /** Coinbase account path (o4): a single use hosted URL, made on the tap. */
  createSession: privateProcedure
    .input(
      z.object({
        amount: z.string().trim().min(1).max(12),
        region: regionInput,
        returnTo: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `onramp:session:${userId}`, limit: 5, windowSeconds: 3600 }],
        "Too many Coinbase links in an hour. Try again later."
      );
      return createCoinbaseSession(userId, {
        cents: cents(input.amount),
        region: region(input.region),
        returnTo: input.returnTo,
        clientIp: clientIpFromRequest(ctx.req),
      }).catch(asClientError);
    }),

  /**
   * Apple Pay or Google Pay (o3): the Coinbase order in embedded mode. Returns
   * the payment link the panel renders in Coinbase's frame. Nothing is charged
   * until the fan presses Coinbase's Apple Pay or Google Pay button.
   */
  createOrder: privateProcedure
    .input(
      z.object({
        amount: z.string().trim().min(1).max(12),
        mode: z.enum(["apple_pay", "google_pay"]),
        region: regionInput,
        agreementAcceptedAt: z.string().datetime(),
        returnTo: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      await enforceRateLimits(
        [{ key: `onramp:order:${userId}`, limit: 5, windowSeconds: 3600 }],
        "Too many Coinbase checkouts in an hour. Try again later."
      );
      return createWalletPayOrder(userId, {
        cents: cents(input.amount),
        mode: input.mode,
        region: region(input.region),
        agreementAcceptedAt: new Date(input.agreementAcceptedAt),
        returnTo: input.returnTo,
        clientIp: clientIpFromRequest(ctx.req),
      }).catch(asClientError);
    }),

  /** What Coinbase's frame posted (commit, error with its code, cancel). Coinbase's status still wins. */
  frameEvent: privateProcedure
    .input(
      z.object({
        sessionId,
        event: z.enum(["commit_success", "error", "cancel"]),
        code: z.string().max(64).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return onrampFrameEvent(ctx.user!.sub, input.sessionId, input.event, input.code).catch(
        asClientError
      );
    }),

  /** Where the purchase is. Arrived only once the USDC is on chain (chainConfirmed). */
  status: privateProcedure.input(z.object({ sessionId })).query(async ({ ctx, input }) => {
    return onrampStatus(ctx.user!.sub, input.sessionId).catch(asClientError);
  }),

  /** Cancel on our side. A purchase Coinbase completes anyway is still recorded. */
  cancel: privateProcedure.input(z.object({ sessionId })).mutation(async ({ ctx, input }) => {
    return cancelOnrampSession(ctx.user!.sub, input.sessionId).catch(asClientError);
  }),
});
