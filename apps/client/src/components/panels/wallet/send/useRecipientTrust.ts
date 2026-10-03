import { useQuery } from "@tanstack/react-query";
import { trpc, type RouterOutputs } from "@repo/ui";
import { RNS_FLAGS } from "@/config/rns/flags";

export type RecipientTrust = RouterOutputs["rns"]["getRecipientTrust"];
export type ResolvedTrust = Extract<RecipientTrust, { status: "ok" }>;

/** 110 I04: one server read for the recipient, by RNS name or address. */
export function useRecipientTrust(query: string | null | undefined) {
  const value = (query ?? "").trim();
  return useQuery({
    ...trpc.rns.getRecipientTrust.queryOptions({ query: value }),
    enabled: RNS_FLAGS.enabled && value.length > 0,
    staleTime: 30_000,
    retry: 1,
  });
}
