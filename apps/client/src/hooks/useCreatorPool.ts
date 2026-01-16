import { useChainId, useReadContract, useWalletClient } from "wagmi";
import { type Address, isAddress, parseEther, zeroAddress } from "viem";
import { useMemo, useEffect, useRef } from "react";
import { CREATOR_POOL_FACTORY_ABI, getChainConfig } from "@ampedbio/web3";
import { useWalletContext } from "@/contexts/WalletContext";

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
  stake: number;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const wallet = useWalletContext();
  const { data: walletClient } = useWalletClient();

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  const hasFetchedRef = useRef(false);

  // Use wagmi's useReadContract hook to get the pool address
  const { data: contractPoolAddress, isLoading: isReadingPoolAddress } = useReadContract({
    address: chain?.contracts?.CREATOR_POOL_FACTORY?.address,
    abi: CREATOR_POOL_FACTORY_ABI,
    functionName: "getPoolForCreator",
    args: wallet.address ? [wallet.address] : undefined,
    query: {
      enabled:
        !!chainId &&
        !!wallet.address &&
        !!chain?.contracts?.CREATOR_POOL_FACTORY?.address &&
        !hasFetchedRef.current,
    },
  });

  useEffect(() => {
    if (contractPoolAddress && isAddress(contractPoolAddress as string) && !isReadingPoolAddress) {
      hasFetchedRef.current = true;
    }
  }, [contractPoolAddress, isReadingPoolAddress]);

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
