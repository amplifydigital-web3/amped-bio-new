import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, type Address } from "viem";

const NODE_CONTRACT_ADDRESS = "0x00000000000000000000000000000000000080fe" as Address;

const NODE_CONTRACT_ABI = [
  {
    type: "function",
    name: "selectNode",
    inputs: [],
    outputs: [{ name: "winner", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "onNodeStaked",
    inputs: [
      { name: "node", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "onNodeUnstaked",
    inputs: [{ name: "node", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decreaseDelegation",
    inputs: [
      { name: "node", type: "address", internalType: "address" },
      { name: "creator", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "increaseDelegation",
    inputs: [
      { name: "node", type: "address", internalType: "address" },
      { name: "creator", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getNodeAtIndex",
    inputs: [{ name: "index", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNodeCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNodes",
    inputs: [],
    outputs: [{ name: "", type: "address[]", internalType: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isNode",
    inputs: [{ name: "_node", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNode",
    inputs: [{ name: "_node", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct NodeData",
        components: [
          { name: "index", type: "uint256", internalType: "uint256" },
          { name: "priority", type: "int256", internalType: "int256" },
          { name: "stakeAmount", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLowestDelegator",
    inputs: [{ name: "node", type: "address", internalType: "address" }],
    outputs: [
      { name: "lowest", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getNodeDelegatorCount",
    inputs: [{ name: "node", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "NewNode",
    inputs: [{ name: "node", type: "address", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "NodeSelected",
    inputs: [{ name: "node", type: "address", indexed: true }],
    anonymous: false,
  },
  {
    type: "event",
    name: "RewardClaimed",
    inputs: [
      { name: "node", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RewardDeposit",
    inputs: [
      { name: "payer", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RewardWithdrawal",
    inputs: [
      { name: "receiver", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NodeRemoved",
    inputs: [
      { name: "node", type: "address", indexed: true },
      { name: "finalStakeAmount", type: "uint256", indexed: false },
      { name: "totalDelegation", type: "uint256", indexed: false },
      { name: "creatorCount", type: "uint256", indexed: false },
      { name: "evicted", type: "bool", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// READS
export function useGetNodes() {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNodes",
  });
}

export function useGetNodeCount() {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNodeCount",
  });
}

export function useGetNode(nodeAddress: Address) {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNode",
    args: [nodeAddress],
    query: { enabled: !!nodeAddress },
  });
}

export function useIsNode(nodeAddress: Address) {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "isNode",
    args: [nodeAddress],
    query: { enabled: !!nodeAddress },
  });
}

export function useGetNodeAtIndex(index: number) {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNodeAtIndex",
    args: [BigInt(index)],
  });
}

export function useGetLowestDelegator(nodeAddress: Address) {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getLowestDelegator",
    args: [nodeAddress],
    query: { enabled: !!nodeAddress },
  });
}

export function useGetNodeDelegatorCount(nodeAddress: Address) {
  return useReadContract({
    address: NODE_CONTRACT_ADDRESS,
    abi: NODE_CONTRACT_ABI,
    functionName: "getNodeDelegatorCount",
    args: [nodeAddress],
    query: { enabled: !!nodeAddress },
  });
}

// WRITES
export function useNodeContractManager() {
  const { data: hash, error, isPending, writeContract } = useWriteContract();

  const selectNode = () => {
    writeContract({
      address: NODE_CONTRACT_ADDRESS,
      abi: NODE_CONTRACT_ABI,
      functionName: "selectNode",
    });
  };

  const onNodeStaked = (node: Address, amount: string) => {
    writeContract({
      address: NODE_CONTRACT_ADDRESS,
      abi: NODE_CONTRACT_ABI,
      functionName: "onNodeStaked",
      args: [node, parseEther(amount)],
    });
  };

  const onNodeUnstaked = (node: Address) => {
    writeContract({
      address: NODE_CONTRACT_ADDRESS,
      abi: NODE_CONTRACT_ABI,
      functionName: "onNodeUnstaked",
      args: [node],
    });
  };

  const decreaseDelegation = (node: Address, creator: Address, amount: string) => {
    writeContract({
      address: NODE_CONTRACT_ADDRESS,
      abi: NODE_CONTRACT_ABI,
      functionName: "decreaseDelegation",
      args: [node, creator, parseEther(amount)],
    });
  };

  const increaseDelegation = (node: Address, creator: Address, amount: string) => {
    writeContract({
      address: NODE_CONTRACT_ADDRESS,
      abi: NODE_CONTRACT_ABI,
      functionName: "increaseDelegation",
      args: [node, creator, parseEther(amount)],
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  return {
    selectNode,
    onNodeStaked,
    onNodeUnstaked,
    decreaseDelegation,
    increaseDelegation,
    hash,
    error,
    isPending,
    isConfirming,
    isConfirmed,
  };
}
