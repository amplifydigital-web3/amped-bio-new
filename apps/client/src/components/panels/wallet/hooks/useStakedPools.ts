import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";
import { useAccount, useWriteContract } from "wagmi";
import { CREATOR_POOL_ABI, getChainConfig, multicall3Abi } from "@ampedbio/web3";
import { type Address, encodeFunctionData } from "viem";
import { UserStakedPool } from "@ampedbio/constants";
import { toast } from "react-hot-toast";
import { useWalletContext } from "@/contexts/WalletContext";

export const useStakedPools = () => {
  const { address: userAddress } = useWalletContext();
  const { chainId } = useAccount();
  const chainConfig = getChainConfig(chainId ?? 0);

  const {
    data: stakedPools,
    isLoading: isLoadingPools,
    refetch: refetchStakedPools,
  } = useQuery({
    ...trpc.pools.fan.getUserStakedPools.queryOptions({
      chainId: chainId?.toString() ?? "0",
    }),
    enabled: !!userAddress && !!chainId,
    refetchInterval: 15000,
  });

  const {
    writeContractAsync: multicall,
    isPending: isClaiming,
    isSuccess: isSuccessClaiming,
    isError: isErrorClaiming,
  } = useWriteContract();

  const refetch = async () => {
    await refetchStakedPools();
  };

  const claimAll = async () => {
    if (!stakedPools) return;

    const poolsToClaim = (stakedPools ?? []).filter(
      pool => pool.pool.pendingRewards && pool.pool.pendingRewards > 0n
    );

    if (poolsToClaim.length === 0) {
      toast.error("No rewards to claim.");
      return;
    }

    if (!chainConfig?.contracts || !("multicall3" in chainConfig.contracts)) {
      toast.error("Multicall contract not found for this chain.");
      return;
    }

    const calls = poolsToClaim.map(pool => ({
      target: pool.pool.address as Address,
      allowFailure: true,
      callData: encodeFunctionData({
        abi: CREATOR_POOL_ABI,
        functionName: "claimReward",
        args: [],
      }),
    }));

    try {
      toast.loading("Claiming all rewards...", { id: "claim-all" });
      await multicall({
        address: chainConfig.contracts.multicall3.address,
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [calls],
      });
      toast.success("Successfully claimed all rewards!", { id: "claim-all" });
      void refetch();
    } catch (error) {
      console.error("Error claiming all rewards:", error);
      toast.error("Failed to claim all rewards.", { id: "claim-all" });
    }
  };

  return {
    stakedPools,
    isLoading: isLoadingPools,
    refetch,
    claimAll,
    isClaiming,
    isSuccessClaiming,
    isErrorClaiming,
  } as {
    stakedPools: UserStakedPool[] | undefined;
    isLoading: boolean;
    refetch: () => Promise<void>;
    claimAll: () => Promise<void>;
    isClaiming: boolean;
    isSuccessClaiming: boolean;
    isErrorClaiming: boolean;
  };
};
