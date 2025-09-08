import { useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi";
import { type Address, parseEther, decodeEventLog } from "viem";
import { useEffect, useMemo, useState } from "react";
import { REVO_NODE_ADDRESSES } from "@ampedbio/web3";

// Contract addresses
export const CONTRACT_ADDRESSES = {
  CREATOR_POOL_FACTORY: "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0" as Address,
} as const;

// ABI for the CreatorPoolFactory contract
const CREATOR_POOL_FACTORY_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "node",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "creatorCut",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "poolName",
        "type": "string"
      }
    ],
    "name": "createPool",
    "outputs": [
      {
        "internalType": "address",
        "name": "poolAddr",
        "type": "address"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "poolAddress",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      }
    ],
    "name": "PoolCreated",
    "type": "event"
  }
] as const;

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
  stake: number;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const [poolAddress, setPoolAddress] = useState<Address | null>(null);

  const {
    writeContractAsync: createPool,
    data: createPoolHash,
    error: createPoolError,
    isPending: isCreatingPool,
  } = useWriteContract();

  const nodeAddress = useMemo(() => {
    return REVO_NODE_ADDRESSES[chainId] || null;
  }, [chainId]);

  const { data: receipt, isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: createPoolHash,
  });

  useEffect(() => {
    if (isConfirmed && receipt) {
      const event = receipt.logs
        .map((log) => {
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
        .find((event) => event?.eventName === "PoolCreated");

      if (event && event.args) {
        setPoolAddress(event.args.poolAddress);
      }
    }
  }, [isConfirmed, receipt]);

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
        value: parseEther(args.stake.toString()),
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
    poolAddress,
  };
}
