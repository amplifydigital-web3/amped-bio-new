import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { trpc } from "@/utils/trpc";

export function useAuthbaseIdentityStatus(address: string | null | undefined) {
  // Validate + canonicalize. `isAddress` (strict) rejects malformed or
  // bad-checksum input; lowercasing gives a stable cache key (the backend
  // lowercases too). `null` disables the query below.
  const normalized = address && isAddress(address) ? address.toLowerCase() : null;

  return useQuery({
    // Input is required by the procedure's shape; the empty-string placeholder
    // is never sent because `enabled` gates the query off until we have a
    // valid, normalized address.
    ...trpc.authbase.getWalletStatus.queryOptions({ address: normalized ?? "" }),
    enabled: normalized !== null,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
