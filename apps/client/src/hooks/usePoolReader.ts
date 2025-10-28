import {
  useReadContract,
} from "wagmi";
import { type Address } from "viem";
import {
  CREATOR_POOL_ABI,
} from "@ampedbio/web3";

export function usePoolReader(poolAddress?: Address) {
  const { data: creatorCutData, isLoading: isReadingCreatorCut } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "creatorCut",
    query: {
      enabled: !!poolAddress,
    },
  });

  const getFanStake = async (publicClient: any, fanAddress: Address) => {
    if (!poolAddress || !publicClient) {
      return null;
    }
    try {
      const stake = await publicClient.readContract({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "fanStakes",
        args: [fanAddress],
      });
      return stake as bigint;
    } catch (error) {
      console.error("Error fetching fan stake:", error);
      return null;
    }
  };

  return {
    creatorCut: creatorCutData,
    isReadingCreatorCut,
    getFanStake,
  };
}