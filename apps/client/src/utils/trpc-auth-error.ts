import { TRPCClientError } from "@trpc/client";
import { ERROR_CAUSES } from "@ampedbio/constants";

/**
 * Utility function to check if a tRPC error is due to token expiration
 */
export function isTRPCTokenExpiredError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return error.data?.cause === ERROR_CAUSES.TOKEN_EXPIRED;
  }
  return false;
}
