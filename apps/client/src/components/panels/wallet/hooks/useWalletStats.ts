import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { formatUnits } from "viem";
import { RouterOutput } from "@/utils/trpc/types";

type WalletStatsOutput = RouterOutput<"wallet", "getWalletStats">;

export const useWalletStats = () => {
  const { data, isLoading } = useQuery(trpc.wallet.getWalletStats.queryOptions());

  const stats = data
    ? {
        myStake: formatUnits(BigInt((data as WalletStatsOutput).myStake), 18),
        stakedToMe: formatUnits(BigInt((data as WalletStatsOutput).stakedToMe), 18),
        stakersSupportingMe: (data as WalletStatsOutput).stakersSupportingMe,
        creatorPoolsJoined: (data as WalletStatsOutput).creatorPoolsJoined,
      }
    : {
        myStake: "0",
        stakedToMe: "0",
        stakersSupportingMe: 0,
        creatorPoolsJoined: 0,
      };

  return {
    stats,
    isLoading,
    refetch: () => {},
  };
};
