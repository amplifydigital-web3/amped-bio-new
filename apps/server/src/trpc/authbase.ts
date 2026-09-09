import { publicProcedure, router } from "./trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isAddress } from "viem";
import { AuthbaseError, getAuthbaseWalletStatus } from "../services/authbase";

export const authbaseRouter = router({
  // Public identity lookup for any wallet — mirrors the rns-backend proxy at
  // GET /api/authbase/wallets/:address/status. No auth: a wallet's verification
  // status is public, and the profile view calls it for arbitrary addresses.
  getWalletStatus: publicProcedure
    .input(
      z.object({
        address: z
          .string()
          .refine(isAddress, { message: "Invalid wallet address" }),
      })
    )
    .query(async ({ input }) => {
      try {
        return await getAuthbaseWalletStatus(input.address);
      } catch (err) {
        if (err instanceof AuthbaseError) {
          // 401 (bad/missing key) and 429 (rate limited) are our-side problems
          // or transient — present both as a generic "unavailable" to the client.
          if (err.httpStatus === 401) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message:
                "Authbase verification is temporarily unavailable. Please try again later.",
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
    }),
});
