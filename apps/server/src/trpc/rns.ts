import { z } from "zod";
import { isAddress } from "viem";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./trpc";
import { getRnsAddressSummary } from "../services/rnsSummary";
import { getRecipientTrust } from "../services/rnsTrust";

// 110 I04: per process limit on the public trust read (60 a minute per client)
const TRUST_LIMIT = 60;
const TRUST_WINDOW_MS = 60_000;
const MAX_BUCKETS = 50_000;
const trustBuckets = new Map<string, { count: number; resetAt: number }>();

function trustLimited(key: string): boolean {
  const now = Date.now();
  const bucket = trustBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (trustBuckets.size > MAX_BUCKETS) trustBuckets.clear();
    trustBuckets.set(key, { count: 1, resetAt: now + TRUST_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > TRUST_LIMIT;
}

/**
 * Revolution Name Service (RNS) reads for the Wallet RNS tab, the address
 * view and Send (Screen Review 100 I08). Public: no Authbase attributes and
 * no account data beyond a page that is already public.
 */
export const rnsRouter = router({
  addressSummary: publicProcedure
    .input(z.object({ address: z.string().refine(isAddress, "Invalid wallet address") }))
    .query(async ({ input }) => {
      try {
        return await getRnsAddressSummary(input.address);
      } catch (error) {
        console.error("[rns] address summary failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "This address could not be checked. Try again in a moment.",
        });
      }
    }),

  /**
   * Screen Review 110 I03, I04: who a sender pays, for an RNS name or an
   * address. Verified owner needs an active name that points to its owner and
   * an Authbase verified wallet. Senders always see it (110 D1).
   */
  getRecipientTrust: publicProcedure
    .input(z.object({ query: z.string().trim().min(1).max(80) }))
    .query(async ({ input, ctx }) => {
      const client = ctx.req.ip || ctx.req.socket?.remoteAddress || "unknown";
      if (trustLimited(client)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many checks. Wait a minute and try again.",
        });
      }
      try {
        return await getRecipientTrust(input.query);
      } catch (error) {
        console.error("[rns] recipient trust failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not check this recipient. Try again in a moment.",
        });
      }
    }),
});
