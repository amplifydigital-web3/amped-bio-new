import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { trpc } from "@repo/ui";

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

/**
 * The signed-in user's own Authbase status, including the attributes they
 * shared with Amped.Bio. Owner only on the server (keyed by the session
 * wallet). Enable it only when the viewer owns the name being shown.
 */
export function useMyAuthbaseStatus(enabled: boolean) {
  return useQuery({
    ...trpc.authbase.getMyStatus.queryOptions(),
    enabled,
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
