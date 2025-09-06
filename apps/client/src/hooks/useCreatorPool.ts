import { useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi";
import { type Address } from "viem";
import { useMemo } from "react";
import { REVO_NODE_ADDRESSES } from "@ampedbio/web3";

// Contract addresses
export const CONTRACT_ADDRESSES = {
  CREATOR_POOL_FACTORY: "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0" as Address,
} as const;

// ABI for the CreatorPoolFactory contract
const CREATOR_POOL_FACTORY_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "creatorCut",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "poolName",
        type: "string",
      },
    ],
    name: "createPool",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const {
    writeContractAsync: createPool,
    data: createPoolHash,
    error: createPoolError,
    isPending: isCreatingPool,
  } = useWriteContract();

  const nodeAddress = useMemo(() => {
    return REVO_NODE_ADDRESSES[chainId] || null;
  }, [chainId]);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: createPoolHash,
  });

  const handleCreatePool = async (args: CreatePoolArgs) => {
    try {
      console.log("handleCreatePool called with args:", args);
      if (!nodeAddress) {
        console.error("No node available to create a pool.");
        return;
      }
      console.log("Using node:", nodeAddress);

      await createPool({
        address: CONTRACT_ADDRESSES.CREATOR_POOL_FACTORY,
        abi: CREATOR_POOL_FACTORY_ABI,
        functionName: "createPool",
        args: [nodeAddress, BigInt(args.creatorCut), args.poolName],
      });
    } catch (error) {
      console.error("Error creating pool", error);
    }
  };

  return {
    createPool: handleCreatePool,
    createPoolHash,
    createPoolError,
    isCreatingPool,
    isConfirming,
    isConfirmed,
  };
}
