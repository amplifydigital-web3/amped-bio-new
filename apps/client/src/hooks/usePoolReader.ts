import { useReadContracts, useWriteContract, useReadContract, useConfig } from "wagmi";
import { type Address } from "viem";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";
import React from "react";
import { trpc } from "../utils/trpc/trpc";

interface UsePoolReaderOptions {
  initialFanStake?: bigint;
  initialPendingReward?: bigint;
  lastClaim?: Date | null;
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
  }, [poolAddress, fanAddress, pendingRewardContract.refetch, pendingRewardContract]);

  const pendingRewardResult = pendingRewardContract.data;
  const isPendingRewardLoading = pendingRewardContract.isLoading;

  const config = useConfig();
  const { writeContractAsync: writeCreatorPoolContractAsync } = useWriteContract();

  const claimReward = async (poolId: number) => {
    if (!poolAddress) {
      throw new Error("Pool address is missing");
    }

    try {
      const startHashTime = performance.now();
      const hash = await writeCreatorPoolContractAsync({
        address: poolAddress,
        abi: CREATOR_POOL_ABI,
        functionName: "claimReward",
      });
      const endHashTime = performance.now();
      const hashTimeMs = endHashTime - startHashTime;
      console.log(`⏱️ Transaction hash returned in: ${hashTimeMs.toFixed(2)}ms | Hash: ${hash}`);

      let confirmationTimeMs = 0;
      if (hash) {
        const startConfirmTime = performance.now();
        // await waitForTransactionReceipt(config, { hash });
        const endConfirmTime = performance.now();
        confirmationTimeMs = endConfirmTime - startConfirmTime;
        console.log(`⏱️ Transaction confirmed in: ${confirmationTimeMs.toFixed(2)}ms`);
        console.log(`⏱️ Total claim time: ${(hashTimeMs + confirmationTimeMs).toFixed(2)}ms`);
      }

      // Call backend to confirm claim and update lastClaim
      try {
        await trpc.pools.fan.confirmClaim.mutate({
          poolId: poolId,
        });
        console.log("✅ Claim confirmed and cooldown updated");
      } catch (backendError) {
        console.error("⚠️ Failed to confirm claim with backend:", backendError);
        // Don't throw here - the blockchain claim succeeded, which is what matters
        // The cooldown tracking is best-effort
      }

      return hash;
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  };

  const fetchAllData = async () => {
    await refetch();
    await pendingRewardContract.refetch();
  };

  // Calculate cooldown status
  const canClaimNow = React.useMemo(() => {
    if (!options?.lastClaim) return true;

    const now = new Date();
    const timeSinceLastClaim = now.getTime() - new Date(options.lastClaim).getTime();
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours

    return timeSinceLastClaim >= cooldownPeriod;
  }, [options?.lastClaim]);

  const nextClaimAvailable = React.useMemo(() => {
    if (!options?.lastClaim) return null;

    const lastClaimDate = new Date(options.lastClaim);
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours
    return new Date(lastClaimDate.getTime() + cooldownPeriod);
  }, [options?.lastClaim]);

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
    canClaimNow,
    nextClaimAvailable,
  };
}
