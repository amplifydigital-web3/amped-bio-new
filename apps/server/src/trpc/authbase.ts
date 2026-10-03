import { privateProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isAddress } from "viem";
import { prisma } from "@repo/database";
import { AuthbaseError, getAuthbaseWalletStatus, isAuthbaseConfigured } from "../services/authbase";

// Screen Review 105 I04, 106 I08: one Notify me for RNS attributes and facets.
const IDENTITY_NEXT = "rns_identity_next";

// Map an upstream Authbase failure to a client-safe tRPC error. The raw detail
// stays in the server log; the user-facing copy stays generic.
function toTrpcError(err: unknown): never {
  if (err instanceof AuthbaseError) {
    // 401 (bad/missing key) and 429 (rate limited) are our-side problems
    // or transient — present both as a generic "unavailable" to the client.
    if (err.httpStatus === 401) {
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "Authbase verification is temporarily unavailable. Please try again later.",
      });
    }
    if (err.httpStatus === 429) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Authbase rate limited, try again shortly",
      });
    }
    // Any other upstream failure (4xx/5xx/network) → bad gateway. Log the
    // raw detail (may carry an upstream status/body slice) for debugging,
    // but keep it off the client — the user-facing copy stays generic.
    console.error("[authbase] upstream failure", {
      httpStatus: err.httpStatus,
      message: err.message,
    });
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: "Authbase verification is temporarily unavailable. Please try again later.",
    });
  }
  console.error("[authbase] unexpected error", err);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
}

export const authbaseRouter = router({
  // Whether the integration is configured server-side. The client gates the
  // Identity tab on this so an unconfigured deployment hides the feature
  // instead of showing every visitor an "Unavailable" error.
  isConfigured: publicProcedure.query(() => ({ configured: isAuthbaseConfigured() })),

  // Public identity lookup for any wallet, mirroring the rns-backend proxy at
  // GET /api/authbase/wallets/:address/status. No auth: a wallet's verification
  // status is public, and the profile view calls it for arbitrary addresses.
  // Shared attributes are stripped here (Screen Review 104 D1).
  getWalletStatus: publicProcedure
    .input(
      z.object({
        address: z.string().refine(isAddress, { message: "Invalid wallet address" }),
      })
    )
    .query(async ({ input }) => {
      try {
        const status = await getAuthbaseWalletStatus(input.address);
        // Consent to share attributes with Amped.Bio is not consent to publish
        // them. The public lookup returns status, tier, dates and badge only.
        // The owner reads their own attributes through getMyStatus.
        return { ...status, attributes: {} as Record<string, string> };
      } catch (err) {
        toTrpcError(err);
      }
    }),

  // Owner only: the signed-in user's own Authbase status, including the
  // attributes they chose to share with Amped.Bio. Keyed by the session wallet,
  // never by client input. Returns null when the account has no wallet.
  getMyStatus: privateProcedure.query(async ({ ctx }) => {
    const wallet = ctx.user?.wallet;
    if (!wallet || !isAddress(wallet)) return null;
    try {
      return await getAuthbaseWalletStatus(wallet);
    } catch (err) {
      toTrpcError(err);
    }
  }),

  // Notify me on the RNS Attributes and Facets tabs (105 I04, 106 I08). One
  // record per account, shared by both tabs.
  identityInterest: privateProcedure.query(async ({ ctx }) => {
    const row = await prisma.featureInterest.findUnique({
      where: { user_id_feature: { user_id: ctx.user!.sub, feature: IDENTITY_NEXT } },
      select: { id: true },
    });
    return { on: !!row };
  }),

  setIdentityInterest: privateProcedure
    .input(z.object({ on: z.boolean(), source: z.enum(["attributes", "facets"]) }))
    .mutation(async ({ ctx, input }) => {
      const key = { user_id: ctx.user!.sub, feature: IDENTITY_NEXT };
      if (input.on) {
        await prisma.featureInterest.upsert({
          where: { user_id_feature: key },
          create: { ...key, source: input.source },
          update: {},
        });
      } else {
        await prisma.featureInterest.deleteMany({ where: key });
      }
      return { on: input.on };
    }),
});
