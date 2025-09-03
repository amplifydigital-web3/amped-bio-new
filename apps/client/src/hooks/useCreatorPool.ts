import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, type Address } from "viem";

// Contract addresses
export const CONTRACT_ADDRESSES = {
  CREATOR_POOL_FACTORY: "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0" as Address,
} as const;

// ABI for the CreatorPoolFactory contract
// TODO: Replace with the actual ABI
const CREATOR_POOL_FACTORY_ABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_description",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_imageUrl",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_initialStake",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_creatorFee",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "minStake",
            "type": "uint256"
          },
          {
            "internalType": "string[]",
            "name": "perks",
            "type": "string[]"
          }
        ],
        "internalType": "struct CreatorPoolFactory.StakingTier[]",
        "name": "_stakingTiers",
        "type": "tuple[]"
      }
    ],
    "name": "createPool",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export interface StakingTier {
  name: string;
  minStake: number;
  perks: string[];
}

export interface CreatePoolArgs {
  name: string;
  description: string;
  imageUrl: string;
  initialStake: number;
  creatorFee: number;
  stakingTiers: StakingTier[];
}

export function useCreatorPool() {
  const {
    writeContract: createPool,
    data: createPoolHash,
    error: createPoolError,
    isPending: isCreatingPool,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: createPoolHash,
    });

  const handleCreatePool = (args: CreatePoolArgs) => {
    createPool({
      address: CONTRACT_ADDRESSES.CREATOR_POOL_FACTORY,
      abi: CREATOR_POOL_FACTORY_ABI,
      functionName: "createPool",
      args: [
        args.name,
        args.description,
        args.imageUrl,
        parseEther(args.initialStake.toString()),
        BigInt(args.creatorFee),
        args.stakingTiers.map(tier => ({
          ...tier,
          minStake: parseEther(tier.minStake.toString()),
        })),
      ],
    });
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
