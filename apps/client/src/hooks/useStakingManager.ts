import { useState, useMemo } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { L2_BASE_TOKEN_ABI, getChainConfig } from "@repo/web3";
import { trpc } from "@repo/ui";
import { useMutation } from "@tanstack/react-query";

interface StakingPoolData {
  id: number;
  chainId: string;
  address: string;
}

export interface StakeActionOptions {
  // Called as soon as the wallet returns the transaction hash, before the
  // server confirms it, so the flow can move from "Confirm in your wallet" to
  // "Submitting" and keep the hash for the explorer link.
  onHash?: (hash: `0x${string}`) => void;
  // Unstake the exact amount in wei (Max), instead of parsing the amount string
  amountWei?: bigint;
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

  const run = async (
    functionName: "stake" | "unstake",
    amount: string,
    options?: StakeActionOptions
  ): Promise<`0x${string}`> => {
    if (!publicClient) {
      throw new Error("Public client is not available");
    }

    if (!pool || !pool.address || !userAddress) {
      throw new Error("Pool address or user address is missing");
    }

    const tokenAddress = chain?.contracts.L2_BASE_TOKEN?.address;
    if (!tokenAddress) {
      throw new Error("L2BaseToken contract address is not configured for this chain");
    }

    setIsStaking(true);
    setStakeActionError(null);

    let hash: `0x${string}`;
    try {
      const parsedAmount = options?.amountWei ?? parseEther(amount);

      hash = await writeL2TokenContractAsync({
        address: tokenAddress,
        abi: L2_BASE_TOKEN_ABI,
        functionName,
        args: [pool.address as `0x${string}`, parsedAmount],
      });
      options?.onHash?.(hash);

      // The server waits for the receipt before it records the stake change
      const confirm = functionName === "stake" ? confirmStakeMutation : confirmUnstakeMutation;
      await confirm.mutateAsync({ chainId: pool.chainId, hash });
    } catch (error) {
      setStakeActionError(error instanceof Error ? error.message : "An unknown error occurred");
      // Rethrow the original error so callers can tell a wallet rejection or a
      // contract revert from other failures
      throw error;
    } finally {
      setIsStaking(false);
    }

    // Call the success callback if provided (for refetching staked pools)
    onStakeSuccess?.();
    return hash;
  };

  const stake = (amount: string, options?: StakeActionOptions) => run("stake", amount, options);
  const unstake = (amount: string, options?: StakeActionOptions) => run("unstake", amount, options);

  return {
    isStaking,
    stakeActionError,
    stake,
    unstake,
  };
}
