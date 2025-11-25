import { useReadContracts, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";

export function usePoolReader(poolAddress?: Address, fanAddress?: Address) {
  const poolContract = {
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
  } as const;

  const contracts = [
    { ...poolContract, functionName: "creatorCut" },
    { ...poolContract, functionName: "poolName" },
    ...(fanAddress
      ? ([
          {
            ...poolContract,
            functionName: "pendingReward",
            args: [fanAddress],
          },
          { ...poolContract, functionName: "fanStakes", args: [fanAddress] },
        ] as const)
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
  const pendingRewardResult = fanAddress ? data?.[2] : undefined;
  const fanStakeResult = fanAddress ? data?.[3] : undefined;

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

  return {
    creatorCut: creatorCutResult?.result as bigint | undefined,
    isReadingCreatorCut: isLoading,
    fanStake: fanStakeResult?.result as bigint | undefined,
    pendingReward: pendingRewardResult?.result as bigint | undefined,
    isReadingPendingReward: isLoading,
    poolName: poolNameResult?.result as string | undefined,
    fetchAllData,
    claimReward,
  };
}
