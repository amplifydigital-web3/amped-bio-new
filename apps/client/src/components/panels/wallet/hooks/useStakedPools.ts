import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";
import { useAccount, useReadContracts } from "wagmi";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";
import { useMemo } from "react";
import { type Address } from "viem";
import { UserStakedPoolWithNullables } from "@ampedbio/constants";

export const useStakedPools = () => {
  const { address: userAddress, chainId } = useAccount();

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
          functionName: "poolName",
        },
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

  const combinedData = useMemo(() => {
    console.info("Combining staked pools with multicall data", stakedPools);

    return stakedPools?.map((pool, index) => {
      const poolName = multicallData?.[index * 3]?.result as string | undefined;
      const pendingRewards = multicallData?.[index * 3 + 1]?.result as bigint | undefined;
      const stakedByYouResult = multicallData?.[index * 3 + 2]?.result as bigint | undefined;

      return {
        ...pool,
        pool: {
          ...pool.pool,
          name: poolName ?? pool.pool.name, // Use blockchain name if available, fallback to placeholder
        },
        pendingRewards: pendingRewards ?? pool.pool.pendingRewards, // Use multicall data first, fallback to backend value
        stakedByYou: stakedByYouResult ?? pool.pool.stakedByYou, // Use multicall data first, fallback to backend value
      };
    });
  }, [stakedPools, multicallData]);

  const refetch = async () => {
    await refetchStakedPools();
    await refetchMulticallData();
  };

  return {
    stakedPools: combinedData,
    isLoading: isLoadingPools,
    refetch,
  } as {
    stakedPools: UserStakedPoolWithNullables[] | undefined;
    isLoading: boolean;
    refetch: () => Promise<void>;
  };
};
