import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { CREATOR_POOL_ABI, getChainConfig, multicall3Abi } from "@ampedbio/web3";
import { useMemo } from "react";
import { type Address, encodeFunctionData } from "viem";
import { UserStakedPoolWithNullables } from "@ampedbio/constants";
import { toast } from "react-hot-toast";

export const useStakedPools = () => {
  const { address: userAddress, chainId } = useAccount();
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
  });

  const contracts = useMemo(() => {
    return (stakedPools || []).flatMap(pool => {
      const poolAddress = pool.pool.address as Address;
      return [
        {
          address: poolAddress,
          abi: CREATOR_POOL_ABI,
          functionName: "pendingReward",
          args: [userAddress],
        },
        {
          address: poolAddress,
          abi: CREATOR_POOL_ABI,
          functionName: "fanStakes",
          args: [userAddress],
        },
      ];
    });
  }, [stakedPools, userAddress]);

  const { data: multicallData, refetch: refetchMulticallData } = useReadContracts({
    contracts,
    query: {
      enabled: (stakedPools?.length ?? 0) > 0,
    },
  });

  const {
    writeContractAsync: multicall,
    isPending: isClaiming,
    isSuccess: isSuccessClaiming,
    isError: isErrorClaiming,
  } = useWriteContract();

  const combinedData = useMemo(() => {
    return stakedPools?.map((pool, index) => {
      const pendingRewards = multicallData?.[index * 2]?.result as bigint | undefined;
      const stakedByYouResult = multicallData?.[index * 2 + 1]?.result as bigint | undefined;

      return {
        ...pool,
        pendingRewards: pendingRewards ?? pool.pool.pendingRewards, // Use multicall data first, fallback to backend value
        stakedByYou: stakedByYouResult ?? pool.pool.stakedByYou, // Use multicall data first, fallback to backend value
      };
    });
  }, [stakedPools, multicallData]);

  const refetch = async () => {
    await refetchStakedPools();
    await refetchMulticallData();
  };

  const claimAll = async () => {
    if (!combinedData) return;

    const poolsToClaim = combinedData.filter(
      pool => pool.pendingRewards && pool.pendingRewards > 0
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
    stakedPools: combinedData,
    isLoading: isLoadingPools,
    refetch,
    claimAll,
    isClaiming,
    isSuccessClaiming,
    isErrorClaiming,
  } as {
    stakedPools: UserStakedPoolWithNullables[] | undefined;
    isLoading: boolean;
    refetch: () => Promise<void>;
    claimAll: () => Promise<void>;
    isClaiming: boolean;
    isSuccessClaiming: boolean;
    isErrorClaiming: boolean;
  };
};
