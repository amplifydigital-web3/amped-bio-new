import { useChainId, useAccount, useReadContract, useWalletClient } from "wagmi";
import { type Address, parseEther, zeroAddress } from "viem";
import { useMemo } from "react";
import { CREATOR_POOL_FACTORY_ABI, getChainConfig } from "@ampedbio/web3";
import { useAuth } from "@/contexts/AuthContext";

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
  stake: number;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const { authUser } = useAuth();
  const { address: userAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  // Use wagmi's useReadContract hook to get the pool address
  const { data: contractPoolAddress, isLoading: isReadingPoolAddress } = useReadContract({
    address: chain?.contracts?.CREATOR_POOL_FACTORY?.address,
    abi: CREATOR_POOL_FACTORY_ABI,
    functionName: "getPoolForCreator",
    args: [(authUser?.wallet ?? userAddress) as `0x${string}`],
    query: {
      enabled: !!chainId && !!userAddress && !!chain?.contracts?.CREATOR_POOL_FACTORY?.address,
    },
  });

  console.info("contractPoolAddress", contractPoolAddress);

  const poolAddress = useMemo(() => {
    // If we're still reading or there's no data, return null
    if (isReadingPoolAddress || !contractPoolAddress) {
      return null;
    }

    // If the address is the zero address, it means no pool exists for this creator
    if (zeroAddress === contractPoolAddress) {
      return null;
    }

    return contractPoolAddress as Address;
  }, [contractPoolAddress, isReadingPoolAddress]);

  const handleCreatePool = async (args: CreatePoolArgs) => {
    if (!chain?.contracts.NODE.address) {
      const error = new Error("No node available to create a pool.");
      console.error(error.message);
      throw error;
    }
    console.log("Calling createPool on factory:", {
      chainId,
      factoryAddress: chain.contracts.CREATOR_POOL_FACTORY.address,
      nodeAddress: chain.contracts.NODE.address,
      creatorCut: args.creatorCut,
      poolName: args.poolName,
      stake: args.stake,
    });

    if (!walletClient) {
      throw new Error("Wallet client not available");
    }

    const hash = await walletClient.writeContract({
      address: chain.contracts.CREATOR_POOL_FACTORY.address,
      abi: CREATOR_POOL_FACTORY_ABI,
      functionName: "createPool",
      args: [chain.contracts.NODE.address, BigInt(args.creatorCut * 100), args.poolName],
      value: parseEther(args.stake.toString()),
      gas: BigInt(5000000), // Add explicit gas limit
    });

    return hash;
  };

  return {
    createPool: handleCreatePool,
    poolAddress,
    isLoading: isReadingPoolAddress,
  };
}
