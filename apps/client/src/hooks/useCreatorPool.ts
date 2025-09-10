import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useAccount,
  useReadContract,
} from "wagmi";
import { type Address, parseEther, decodeEventLog, zeroAddress } from "viem";
import { useEffect, useMemo } from "react";
import { CREATOR_POOL_FACTORY_ABI, getChainConfig } from "@ampedbio/web3";

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
  stake: number;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const { address: userAddress } = useAccount();

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  // Use wagmi's useReadContract hook to get the pool address
  const { data: contractPoolAddress, isLoading: isReadingPoolAddress } = useReadContract({
    address: chain?.contracts?.CREATOR_POOL_FACTORY?.address,
    abi: CREATOR_POOL_FACTORY_ABI,
    functionName: "getPoolForCreator",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!chainId && !!userAddress && !!chain?.contracts?.CREATOR_POOL_FACTORY?.address,
    },
  });

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

  const {
    writeContractAsync: createPool,
    data: createPoolHash,
    error: createPoolError,
    isPending: isCreatingPool,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: createPoolHash,
  });

  useEffect(() => {
    if (isConfirmed && receipt) {
      const event = receipt.logs
        .map(log => {
          try {
            return decodeEventLog({
              abi: CREATOR_POOL_FACTORY_ABI,
              data: log.data,
              topics: log.topics,
            });
          } catch (e) {
            return null;
          }
        })
        .find(event => event?.eventName === "PoolCreated");

      if (event && event.args) {
        // This will override the read contract value with the newly created pool address
        // The read contract will eventually update to reflect this as well
      }
    }
  }, [isConfirmed, receipt]);

  const handleCreatePool = async (args: CreatePoolArgs) => {
    try {
      console.log("handleCreatePool called with args:", args);
      if (!chain?.contracts.NODE.address) {
        const error = new Error("No node available to create a pool.");
        console.error(error.message);
        throw error;
      }
      console.log("Using node:", chain.contracts.NODE);

      const hash = await createPool({
        address: chain.contracts.CREATOR_POOL_FACTORY.address,
        abi: CREATOR_POOL_FACTORY_ABI,
        functionName: "createPool",
        args: [chain.contracts.NODE.address, BigInt(args.creatorCut), args.poolName],
        value: parseEther(args.stake.toString()),
      });

      return hash;
    } catch (error) {
      console.error("Error creating pool", error);
      throw error; // Rethrow the error
    }
  };

  return {
    createPool: handleCreatePool,
    createPoolHash,
    createPoolError,
    isCreatingPool,
    isConfirming,
    isConfirmed,
    poolAddress,
    isLoading: isReadingPoolAddress,
  };
}
