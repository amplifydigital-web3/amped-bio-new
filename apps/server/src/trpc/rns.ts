import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { TRPCError } from "@trpc/server";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { prisma } from "@repo/database";
import { getRnsAddressSummary } from "../services/rnsSummary";
import { getRecipientTrust } from "../services/rnsTrust";
import {
  computeRnsIdentity,
  listRnsNamesForWallet,
  parseRnsDisplay,
  rnsIdBlockOptions,
} from "../services/rnsIdentity";
import { isAuthbaseConfigured } from "../services/authbase";
import { env } from "../env";

async function accountRns(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      revo_name: true,
      rns_display: true,
      created_at: true,
      wallet: { select: { address: true } },
      blocks: { select: { type: true, config: true } },
    },
  });
}

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

  /**
   * Screen Review 108 I03: the names the account wallet (UserWallet) owns,
   * never the browser's connected wallet. Each carries its binding state, so
   * the select offers only names the server will accept.
   */
  listMyNames: privateProcedure.query(async ({ ctx }) => {
    const account = await accountRns(ctx.user!.sub);
    const address = account?.wallet?.address;
    if (!address || !isAddress(address, { strict: false })) return { wallet: null, names: [] };
    try {
      return {
        wallet: getAddress(address),
        names: await listRnsNamesForWallet(getAddress(address)),
      };
    } catch (error) {
      console.error("[rns] listMyNames failed", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Your RNS names did not load. Try again in a moment.",
      });
    }
  }),

  /**
   * Screen Review 108 I07, I08, I11: the owner's view. The stored name and its
   * state now (the private status that left getHandle, 108 I02), the identity
   * check without attributes, the display settings, and the public identity
   * exactly as getHandle returns it, for the preview chip.
   */
  getMyPageIdentity: privateProcedure.query(async ({ ctx }) => {
    const account = await accountRns(ctx.user!.sub);
    const display = parseRnsDisplay(account?.rns_display);
    const result = await computeRnsIdentity(
      {
        storedName: account?.revo_name ?? null,
        wallet: account?.wallet?.address ?? null,
        display,
        // 112: the RNS ID block's switches, so the preview equals the page
        block: rnsIdBlockOptions(account?.blocks ?? []),
      },
      { fresh: true }
    );
    return {
      label: result.label,
      name: result.name,
      nameState: result.nameState,
      expiry: result.expiry,
      display,
      /** 112: the month the page joined, as getHandle returns it */
      since: account?.created_at ? account.created_at.toISOString().slice(0, 7) : null,
      /** 112 D1: whether Name on ID can show at all (flag on and Authbase shared a name) */
      nameOnIdAvailable:
        env.RNS_PUBLIC_ATTRIBUTES &&
        result.verification.state === "verified" &&
        !!result.verification.nameOnId,
      /** off: Authbase is not configured or the public identity flag is off; no badge row */
      verification:
        isAuthbaseConfigured() && env.RNS_PUBLIC_IDENTITY
          ? result.verification
          : { state: "off" as const },
      identity: result.identity,
    };
  }),
});
