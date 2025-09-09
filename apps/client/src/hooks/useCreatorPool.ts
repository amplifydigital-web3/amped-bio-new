import { useWriteContract, useWaitForTransactionReceipt, useChainId } from "wagmi";
import { type Address, parseEther, decodeEventLog } from "viem";
import { useEffect, useMemo, useState } from "react";
import { CREATOR_POOL_FACTORY_ABI, getChainConfig } from "@ampedbio/web3";

export interface CreatePoolArgs {
  creatorCut: number;
  poolName: string;
  stake: number;
}

export function useCreatorPool() {
  const chainId = useChainId();
  const [poolAddress, setPoolAddress] = useState<Address | null>(null);

  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

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
        setPoolAddress(event.args.poolAddress);
      }
    }
  }, [isConfirmed, receipt]);

  const handleCreatePool = async (args: CreatePoolArgs) => {
    try {
      console.log("handleCreatePool called with args:", args);
      if (!chain?.contracts.NODE.address) {
        console.error("No node available to create a pool.");
        return;
      }
      console.log("Using node:", chain.contracts.NODE);

      await createPool({
        address: chain.contracts.CREATOR_POOL_FACTORY.address,
        abi: CREATOR_POOL_FACTORY_ABI,
        functionName: "createPool",
        args: [chain.contracts.NODE.address, BigInt(args.creatorCut), args.poolName],
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
