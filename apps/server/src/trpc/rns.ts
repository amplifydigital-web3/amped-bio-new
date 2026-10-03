import { z } from "zod";
import { isAddress } from "viem";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "./trpc";
import { getRnsAddressSummary } from "../services/rnsSummary";

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
});
