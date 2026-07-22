import { useWriteContract } from "wagmi";
import { type Address } from "viem";
import { CREATOR_POOL_ABI } from "@ampedbio/web3";
import { trpcClient, trpc } from "../utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";

interface UsePoolReaderOptions {
  initialFanStake?: bigint;
  initialPendingReward?: bigint;
  lastClaim?: Date | null;
}

export function usePoolReader(
  poolAddress: Address | undefined,
  fanAddress: Address | undefined,
  chainId: number | string | undefined,
  options?: UsePoolReaderOptions
) {
  const hasInitialData = options?.initialFanStake !== undefined || options?.initialPendingReward !== undefined;
  const { data: liveData, refetch: refetchLiveData } = useQuery({
    ...trpc.pools.fan.getLiveUserPoolData.queryOptions({
      poolAddress: poolAddress!,
      userAddress: fanAddress!,
      chainId: chainId?.toString() ?? "",
    }),
    enabled: !!poolAddress && !!fanAddress && !!chainId,
    refetchInterval: 15000,
    initialData: hasInitialData ? {
      fanStakes: options?.initialFanStake?.toString() ?? "0",
      pendingReward: options?.initialPendingReward?.toString() ?? "0",
    } : undefined,
  });

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

      try {
        await trpcClient.pools.fan.confirmClaim.mutate({
          poolId: poolId,
        });
        console.log("✅ Claim confirmed and cooldown updated");
      } catch (backendError) {
        console.error("⚠️ Failed to confirm claim with backend:", backendError);
      }

      return hash;
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  };

  return {
    fanStake: liveData?.fanStakes !== undefined ? BigInt(liveData.fanStakes) : undefined,
    pendingReward: liveData?.pendingReward !== undefined ? BigInt(liveData.pendingReward) : undefined,
    isReadingPendingReward: false,
    claimReward,
    refetchLiveData,
  };
}
