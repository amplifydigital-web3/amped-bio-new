import { useQuery } from "@tanstack/react-query";
import { formatEther, type Address } from "viem";
import { getChainConfig } from "@repo/web3";
import { trpcClient } from "@repo/ui";
import type { Recipient } from "./model";

const MAX_RECENT = 5;

type ExplorerTransaction = {
  from: string;
  to: string | null;
  value: string;
  receivedAt: string;
};

export type RecentRecipient = Recipient & { lastAmount: string; lastSentAt: string };

/**
 * 062 I06, I07: up to five people the wallet sent to in the last 7 days, most
 * recent first, one row per address, with the last amount. Fetched when the
 * Send panel opens and kept for a minute.
 */
export function useRecentRecipients(
  address: Address | undefined,
  chainId: number,
  enabled: boolean
) {
  const apiUrl = getChainConfig(chainId)?.blockExplorers?.default.apiUrl;

  return useQuery({
    queryKey: ["send", "recent-recipients", address?.toLowerCase(), chainId],
    enabled: enabled && !!address && !!apiUrl,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<RecentRecipient[]> => {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 86400_000);
      const response = await fetch(
        `${apiUrl}/transactions?address=${address}&limit=10&page=1&toDate=${now.toISOString()}&fromDate=${from.toISOString()}`
      );
      if (!response.ok) throw new Error("Recent recipients did not load");
      const data = (await response.json()) as { items?: ExplorerTransaction[] };

      const seen = new Set<string>();
      const recent: RecentRecipient[] = [];
      for (const item of data.items ?? []) {
        if (!item.to || item.from.toLowerCase() !== address!.toLowerCase()) continue;
        if (BigInt(item.value || "0") === 0n) continue;
        const key = item.to.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        recent.push({
          address: item.to as Address,
          lastAmount: formatEther(BigInt(item.value)),
          lastSentAt: item.receivedAt,
        });
        if (recent.length === MAX_RECENT) break;
      }
      if (recent.length === 0) return recent;

      // Person first: match each address to an Amped.Bio member
      const profiles = await trpcClient.wallet.getUsersByAddresses
        .query({ addresses: recent.map(item => item.address) })
        .catch(() => ({}) as Record<string, null>);
      return recent.map(item => {
        const profile = (
          profiles as Record<
            string,
            { name: string | null; handle: string | null; image: string | null } | null
          >
        )[item.address.toLowerCase()];
        return profile
          ? { ...item, name: profile.name, handle: profile.handle, avatar: profile.image }
          : item;
      });
    },
  });
}
