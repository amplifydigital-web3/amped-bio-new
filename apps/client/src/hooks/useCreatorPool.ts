import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { type Address } from "viem";
import { useGetNodes } from "@/hooks/useNode";

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
  const { data: nodes, isLoading: isLoadingNodes } = useGetNodes();
  const {
    writeContract: createPool,
    data: createPoolHash,
    error: createPoolError,
    isPending: isCreatingPool,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: createPoolHash,
  });

  const handleCreatePool = (args: CreatePoolArgs) => {
    if (!nodes || nodes.length === 0) {
      console.error("No nodes available to create a pool.");
      return;
    }
    const node = nodes[0]; // Use the first node

    createPool({
      address: CONTRACT_ADDRESSES.CREATOR_POOL_FACTORY,
      abi: CREATOR_POOL_FACTORY_ABI,
      functionName: "createPool",
      args: [node, BigInt(args.creatorCut), args.poolName],
    });
  };

  return {
    createPool: handleCreatePool,
    createPoolHash,
    createPoolError,
    isCreatingPool,
    isConfirming,
    isConfirmed,
    nodes,
    isLoadingNodes,
  };
}
