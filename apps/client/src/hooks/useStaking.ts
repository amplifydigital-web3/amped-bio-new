import { useState, useEffect, useMemo } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { L2_BASE_TOKEN_ABI, getChainConfig } from "@ampedbio/web3";
import { trpc } from "../utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { usePoolReader } from "./usePoolReader";
import { RewardPool } from "../components/panels/explore/ExplorePanel";

export function useStaking(pool: RewardPool | null) {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const { getFanStake, pendingReward, isReadingPendingReward, claimReward } = usePoolReader(
    pool?.poolAddress as `0x${string}` | undefined,
    userAddress as `0x${string}` | undefined
  );

  const [fanStake, setFanStake] = useState("0");
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

  useEffect(() => {
    if (pool?.poolAddress && userAddress && publicClient) {
      const fetchStake = async () => {
        const stake = await getFanStake(publicClient, userAddress);
        if (stake !== null) {
          setFanStake(formatEther(stake));
        }
      };
      fetchStake();
    }
  }, [pool?.poolAddress, userAddress, getFanStake, publicClient]);

  const stake = async (amount: string) => {
    if (!publicClient) {
      throw new Error("Public client is not available");
    }

    if (!pool || !pool.poolAddress || !userAddress) {
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

      const hash = await writeL2TokenContractAsync({
        address: tokenAddress,
        abi: L2_BASE_TOKEN_ABI,
        functionName: "stake",
        args: [pool.poolAddress as `0x${string}`, parsedAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const newStake = (parseFloat(fanStake) + parseFloat(amount)).toString();
      setFanStake(newStake);

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
  };

  const unstake = async (amount: string) => {
    if (!publicClient) {
      throw new Error("Public client is not available");
    }

    if (!pool || !pool.poolAddress || !userAddress) {
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
      const hash = await writeL2TokenContractAsync({
        address: tokenAddress,
        abi: L2_BASE_TOKEN_ABI,
        functionName: "unstake",
        args: [pool.poolAddress as `0x${string}`, parsedAmount],
      });

      await publicClient.waitForTransactionReceipt({ hash });

      const newStake = Math.max(0, parseFloat(fanStake) - parseFloat(amount)).toString();
      setFanStake(newStake);

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
  };

  return {
    fanStake,
    isStaking,
    stakeActionError,
    stake,
    unstake,
    currencySymbol: chain?.nativeCurrency.symbol || "REVO",
    pendingReward,
    isReadingPendingReward,
    claimReward,
  };
}
