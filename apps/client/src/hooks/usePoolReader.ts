import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";

export function usePoolReader(poolAddress?: Address, fanAddress?: Address) {
  const { data: creatorCutData, isLoading: isReadingCreatorCut } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "creatorCut",
    query: {
      enabled: !!poolAddress,
    },
  });

  const {
    data: poolNameData,
    isLoading: isReadingPoolName,
    refetch: refetchPoolName,
  } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "poolName",
    query: {
      enabled: !!poolAddress,
    },
  });

  const {
    data: pendingRewardData,
    isLoading: isReadingPendingReward,
    refetch: refetchPendingReward,
  } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "pendingReward",
    args: fanAddress ? [fanAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!fanAddress,
    },
  });

  const {
    data: fanStakeData,
    isLoading: isReadingFanStake,
    refetch: refetchFanStake,
  } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "fanStakes",
    args: fanAddress ? [fanAddress] : undefined,
    query: {
      enabled: !!poolAddress && !!fanAddress,
    },
  });

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

  return {
    creatorCut: creatorCutData,
    isReadingCreatorCut,
    fanStake: fanStakeData,
    isReadingFanStake,
    refetchFanStake,
    pendingReward: pendingRewardData,
    isReadingPendingReward,
    refetchPendingReward,
    poolName: poolNameData,
    isReadingPoolName,
    refetchPoolName,
    claimReward,
  };
}
