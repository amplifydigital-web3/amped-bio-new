import { useState, useMemo } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { L2_BASE_TOKEN_ABI, getChainConfig } from "@ampedbio/web3";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";

interface StakingPoolData {
  id: number;
  chainId: string;
  address: string;
}

export function useStakingManager(pool: StakingPoolData | null, onStakeSuccess?: () => void) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();

  const [isStaking, setIsStaking] = useState(false);
  const [stakeActionError, setStakeActionError] = useState<string | null>(null);

  const { writeContractAsync: writeL2TokenContractAsync } = useWriteContract();
  const confirmStakeMutation = useMutation(trpc.pools.fan.confirmStake.mutationOptions());
  const confirmUnstakeMutation = useMutation(trpc.pools.fan.confirmUnstake.mutationOptions());

  const chain = useMemo(() => {
    if (!pool) return null;
    const chainId = parseInt(pool.chainId || "0");
    return getChainConfig(chainId);
  }, [pool]);

  const getL2BaseTokenAddress = (): `0x${string}` | undefined => {
    if (!chain) return undefined;
    return chain.contracts.L2_BASE_TOKEN?.address;
  };

  const stake = async (amount: string) => {
    if (!publicClient) {
      throw new Error("Public client is not available");
    }

    if (!pool || !pool.address || !userAddress) {
      throw new Error("Pool address or user address is missing");
    }

    const tokenAddress = getL2BaseTokenAddress();
    if (!tokenAddress) {
      throw new Error("L2BaseToken contract address is not configured for this chain");
    }

    setIsStaking(true);
    setStakeActionError(null);

    try {
      const parsedAmount = parseEther(amount);

      const startHashTime = performance.now();
      const hash = await writeL2TokenContractAsync({
        address: tokenAddress,
        abi: L2_BASE_TOKEN_ABI,
        functionName: "stake",
        args: [pool.address as `0x${string}`, parsedAmount],
      });
      const endHashTime = performance.now();
      const hashTimeMs = endHashTime - startHashTime;
      console.log(
        `⏱️ Stake transaction hash returned in: ${hashTimeMs.toFixed(2)}ms | Hash: ${hash}`
      );

      const startConfirmTime = performance.now();
      await publicClient.waitForTransactionReceipt({ hash, timeout: 5 * 60 * 1000 });
      const endConfirmTime = performance.now();
      const confirmationTimeMs = endConfirmTime - startConfirmTime;
      console.log(`⏱️ Stake transaction confirmed in: ${confirmationTimeMs.toFixed(2)}ms`);
      console.log(`⏱️ Total stake time: ${(hashTimeMs + confirmationTimeMs).toFixed(2)}ms`);

      await confirmStakeMutation.mutateAsync({
        chainId: pool.chainId,
        hash: hash,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      setStakeActionError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsStaking(false);
    }

    // Call the success callback if provided (for refetching staked pools)
    if (onStakeSuccess) {
      onStakeSuccess();
    }
  };

  const unstake = async (amount: string) => {
    if (!publicClient) {
      throw new Error("Public client is not available");
    }

    if (!pool || !pool.address || !userAddress) {
      throw new Error("Pool address or user address is missing");
    }

    const tokenAddress = getL2BaseTokenAddress();
    if (!tokenAddress) {
      throw new Error("L2BaseToken contract address is not configured for this chain");
    }

    setIsStaking(true);
    setStakeActionError(null);

    try {
      const parsedAmount = parseEther(amount);

      const startHashTime = performance.now();
      const hash = await writeL2TokenContractAsync({
        address: tokenAddress,
        abi: L2_BASE_TOKEN_ABI,
        functionName: "unstake",
        args: [pool.address as `0x${string}`, parsedAmount],
      });
      const endHashTime = performance.now();
      const hashTimeMs = endHashTime - startHashTime;
      console.log(
        `⏱️ Unstake transaction hash returned in: ${hashTimeMs.toFixed(2)}ms | Hash: ${hash}`
      );

      const startConfirmTime = performance.now();
      await publicClient.waitForTransactionReceipt({ hash, timeout: 5 * 60 * 1000 });
      const endConfirmTime = performance.now();
      const confirmationTimeMs = endConfirmTime - startConfirmTime;
      console.log(`⏱️ Unstake transaction confirmed in: ${confirmationTimeMs.toFixed(2)}ms`);
      console.log(`⏱️ Total unstake time: ${(hashTimeMs + confirmationTimeMs).toFixed(2)}ms`);

      await confirmUnstakeMutation.mutateAsync({
        chainId: pool.chainId,
        hash: hash,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      setStakeActionError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsStaking(false);
    }

    // Call the success callback if provided (for refetching staked pools)
    if (onStakeSuccess) {
      onStakeSuccess();
    }
  };

  return {
    isStaking,
    stakeActionError,
    stake,
    unstake,
  };
}
