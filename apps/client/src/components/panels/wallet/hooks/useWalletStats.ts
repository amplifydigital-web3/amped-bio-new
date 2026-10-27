import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import { toWei } from "../../explore/pool-panel/format";

/**
 * Screen Review 049: the Wallet summary figures. Staked counts fan stakes plus
 * the creator's own pool stake (I14); Pools joined counts other creators'
 * pools only (I15). Refetches every 15 s and updates in place. `stats` stays
 * null until the first answer, and `failed` is true only when there is no
 * answer to show, so a failed query never reads as 0 (I12).
 */
export function useWalletStats(enabled = true) {
  const query = useQuery({
    ...trpc.wallet.getWalletStats.queryOptions(),
    refetchInterval: 15000,
    enabled,
  });

  const stats = query.data
    ? {
        staked: toWei(query.data.myStake) ?? 0n,
        ownPoolStake: toWei(query.data.ownPoolStake) ?? 0n,
        poolsJoined: query.data.creatorPoolsJoined,
      }
    : null;

  return {
    stats,
    loading: query.isPending,
    failed: query.isError && !query.data,
    refetch: query.refetch,
  };
}
