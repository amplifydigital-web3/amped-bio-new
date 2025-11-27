import { useReadContracts, useWriteContract, useReadContract } from "wagmi";
import { type Address } from "viem";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";
import React from "react";

interface UsePoolReaderOptions {
  initialFanStake?: bigint;
  initialPendingReward?: bigint;
}

export function usePoolReader(
  poolAddress?: Address,
  fanAddress?: Address,
  options?: UsePoolReaderOptions
) {
  const poolContract = {
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
  } as const;

  const contracts = [
    { ...poolContract, functionName: "creatorCut" },
    { ...poolContract, functionName: "poolName" },
    ...(fanAddress
      ? ([{ ...poolContract, functionName: "fanStakes", args: [fanAddress] }] as const)
      : []),
  ];

  const { data, isLoading, refetch } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    contracts,
    query: {
      enabled: !!poolAddress,
    },
  });

  const creatorCutResult = data?.[0];
  const poolNameResult = data?.[1];
  const fanStakeResult = fanAddress ? data?.[2] : undefined;

  // Using useReadContract for pendingReward
  const pendingRewardContract = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "pendingReward",
    args: fanAddress ? [fanAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!fanAddress,
      initialData: options?.initialPendingReward,
    },
  });

  // Set up refetch interval to update pendingReward every 15 seconds
  React.useEffect(() => {
    if (!poolAddress || !fanAddress || !pendingRewardContract.refetch) return;

    const interval = setInterval(() => {
      pendingRewardContract.refetch();
    }, 15000); // 15 seconds

    return () => clearInterval(interval);
  }, [poolAddress, fanAddress, pendingRewardContract.refetch]);

  const pendingRewardResult = pendingRewardContract.data;
  const isPendingRewardLoading = pendingRewardContract.isLoading;

  const { writeContractAsync: writeCreatorPoolContractAsync } = useWriteContract();

  const claimReward = async () => {
    if (!poolAddress) {
      throw new Error("Pool address is missing");
    }
    try {
      const hash = await writeCreatorPoolContractAsync({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "claimReward",
      });
      return hash;
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  };

  const fetchAllData = async () => {
    return await refetch();
  };

  // For pendingReward, we'll use the separate query data
  // During loading, show initial value if available, otherwise show undefined
  const finalPendingReward = isPendingRewardLoading
    ? options?.initialPendingReward
    : pendingRewardResult;

  return {
    creatorCut: creatorCutResult?.result as bigint | undefined,
    isReadingCreatorCut: isLoading,
    fanStake: isLoading
      ? (options?.initialFanStake ?? (fanStakeResult?.result as bigint | undefined))
      : (fanStakeResult?.result as bigint | undefined),
    pendingReward: finalPendingReward,
    isReadingPendingReward: isPendingRewardLoading,
    poolName: poolNameResult?.result as string | undefined,
    fetchAllData,
    claimReward,
  };
}
