import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, type Address } from "viem";

// Contract addresses
export const CONTRACT_ADDRESSES = {
  BASE_TOKEN: "0x000000000000000000000000000000000000800a" as Address,
  NODE_CONTRACT: "0x00000000000000000000000000000000000080fe" as Address,
  CREATOR_POOL_FACTORY: "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0" as Address,
} as const;

// Required ABIs
const BASE_TOKEN_ABI = [
  {
    name: "stakeAsNode",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "stakeOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const NODE_CONTRACT_ABI = [
  {
    name: "getNodes",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
] as const;

// Revolution chain configuration
export const REVOLUTION_CHAIN_CONFIG = {
  chainId: 73863,
  rpcUrl: "https://libertas.revolutionchain.io",
};

export interface UseRevolutionContractsReturn {
  // Stake functions
  stakeAsNode: (amount: string) => void;
  isStaking: boolean;
  stakeError: Error | null;
  stakeHash: Address | undefined;

  // Read stake
  stakeOf: bigint | undefined;
  isLoadingStake: boolean;
  refetchStake: () => void;

  // Get nodes
  nodes: readonly Address[] | undefined;
  isLoadingNodes: boolean;
  nodesError: Error | null;
  refetchNodes: () => void;

  // Utilities
  formatStake: (stake: bigint) => string;
  parseStakeAmount: (amount: string) => bigint;
}

export function useRevolutionContracts(account?: Address): UseRevolutionContractsReturn {
  // Write contract - Stake as Node
  const {
    writeContract: writeStake,
    data: stakeHash,
    error: stakeWriteError,
    isPending: isStaking,
  } = useWriteContract();

  // Wait for stake transaction
  const { isLoading: isStakeConfirming } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  // Read contract - Stake of address
  const {
    data: stakeOf,
    error: stakeReadError,
    isLoading: isLoadingStake,
    refetch: refetchStake,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.BASE_TOKEN,
    abi: BASE_TOKEN_ABI,
    functionName: "stakeOf",
    args: account ? [account] : undefined,
    query: {
      enabled: !!account,
    },
  });

  // Read contract - Get nodes
  const {
    data: nodes,
    error: nodesError,
    isLoading: isLoadingNodes,
    refetch: refetchNodes,
  } = useReadContract({
    address: CONTRACT_ADDRESSES.NODE_CONTRACT,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNodes",
  });

  // Function to stake as node
  const stakeAsNode = (amount: string) => {
    const amountWei = parseEther(amount);

    // Validation: minimum 10,000 REVO
    const minimumStake = parseEther("10000");
    if (amountWei < minimumStake) {
      throw new Error("Minimum stake amount is 10,000 REVO");
    }

    writeStake({
      address: CONTRACT_ADDRESSES.BASE_TOKEN,
      abi: BASE_TOKEN_ABI,
      functionName: "stakeAsNode",
      args: [amountWei],
    });
  };

  // Utility functions
  const formatStake = (stake: bigint): string => {
    return formatEther(stake);
  };

  const parseStakeAmount = (amount: string): bigint => {
    return parseEther(amount);
  };

  return {
    // Stake functions
    stakeAsNode,
    isStaking: isStaking || isStakeConfirming,
    stakeError: stakeWriteError,
    stakeHash,

    // Read stake
    stakeOf,
    isLoadingStake,
    refetchStake,

    // Get nodes
    nodes,
    isLoadingNodes,
    nodesError,
    refetchNodes,

    // Utilities
    formatStake,
    parseStakeAmount,
  };
}

// Hook for staking operations
export function useStaking(account?: Address) {
  const { stakeAsNode, isStaking, stakeError, stakeHash, stakeOf, isLoadingStake, refetchStake } =
    useRevolutionContracts(account);

  return {
    stakeAsNode,
    isStaking,
    stakeError,
    stakeHash,
    currentStake: stakeOf,
    isLoadingStake,
    refetchStake,
    hasMinimumStake: stakeOf ? stakeOf >= parseEther("10000") : false,
  };
}

// Hook for nodes operations
export function useNodes() {
  const { nodes, isLoadingNodes, nodesError, refetchNodes } = useRevolutionContracts();

  return {
    nodes,
    isLoadingNodes,
    nodesError,
    refetchNodes,
    nodesCount: nodes?.length || 0,
  };
}
