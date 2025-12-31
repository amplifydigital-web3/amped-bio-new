import { type Address } from "viem";
import { chainConfig } from "viem/zksync";

export * from "./pools";
export * from "./abis/multicall3";
export * from "./abis/rns/index";

export const revolutionDevnet = {
  ...chainConfig,
  id: 73861,
  name: "Revochain Devnet",
  network: "revochain-devnet",
  nativeCurrency: {
    name: "Revochain Devnet",
    symbol: "dREVO",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://dev.revolutionchain.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Revochain Testnet Explorer",
      url: "https://dev.revoscan.io",
      apiUrl: "https://api.dev.revoscan.io",
    },
  },
  testnet: true,
  contracts: {
    L2_BASE_TOKEN: { address: "0x000000000000000000000000000000000000800A" as Address },
    NODE: { address: "0x0000000000000000000000000000000000000000" as Address },
    CREATOR_POOL_FACTORY: { address: "0x0000000000000000000000000000000000000000" as Address },
    multicall3: { address: "0x0000000000000000000000000000000000000000" as Address },
    REGISTRAR_CONTROLLER: { address: "0x0000000000000000000000000000000000000000" as Address },
    L2_RESOLVER: { address: "0x0000000000000000000000000000000000000000" as Address },
    BASE_REGISTRAR: { address: "0x0000000000000000000000000000000000000000" as Address },
    REVERSE_REGISTRAR: { address: "0x0000000000000000000000000000000000000000" as Address },
  },
  subgraphUrl: "",
  gas: 5_000_000,
} as const;

export const libertasTestnet = {
  ...chainConfig,
  id: 73863,
  name: "Libertas Testnet",
  network: "libertas-testnet",
  nativeCurrency: {
    name: "Libertas Testnet",
    symbol: "tREVO",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://libertas.revolutionchain.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Libertas Testnet Explorer",
      url: "https://libertas.revoscan.io",
      apiUrl: "https://api.libertas.revoscan.io",
    },
  },
  testnet: true,
  contracts: {  
    L2_BASE_TOKEN: { address: "0x000000000000000000000000000000000000800A" as Address },
    NODE: { address: "0x019bbe745b5c9b70060408Bf720B1E5172EEa5A3" as Address },
    CREATOR_POOL_FACTORY: { address: "0x38df3c6acEe3511c088c84d0191f550b24726f0f" as Address },
    multicall3: { address: "0x97cb78d5be963e2534a2156c88093a49f15315c8" as Address },
    REGISTRAR_CONTROLLER: { address: "0x6976f68f9d363962f2e70484a5ACC94Bacb8b671" as Address },
    L2_RESOLVER: { address: "0x9E86dB3c2b644EC19e8dA6Ad21D04B7Af38C3707" as Address },
    BASE_REGISTRAR: { address: "0x6fb4834326a955949A6447F0f0a01333d729C213" as Address },
    REVERSE_REGISTRAR: { address: "0xcEa357DD5F29e574DDe8bB658B1A02b97512F879" as Address },
  },
  subgraphUrl: "https://graph.libertas.revolutionchain.io/subgraphs/name/subgraph/revo-names",
  gas: 5_000_000,
} as const;

export const AVAILABLE_CHAINS = [libertasTestnet, revolutionDevnet] as const;

export const getChainConfig = (chainId: number) => {
  const chain = AVAILABLE_CHAINS.find(c => c.id === chainId);
  return chain ? { ...chain } : null;
};

export const getCurrencySymbol = (chainId: number) => {
  const chain = getChainConfig(chainId);
  return chain ? chain.nativeCurrency.symbol : "REVO";
};

export const REVO_NODE_ADDRESSES = {
  [libertasTestnet.id]: libertasTestnet.contracts.NODE,
  [revolutionDevnet.id]: revolutionDevnet.contracts.NODE,
};

export const CREATOR_POOL_FACTORY_ABI = [
  {
    type: "function",
    name: "createPool",
    inputs: [
      {
        name: "node",
        type: "address",
      },
      {
        name: "creatorCut",
        type: "uint256",
      },
      {
        name: "poolName",
        type: "string",
      },
    ],
    outputs: [
      {
        name: "poolAddr",
        type: "address",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getAllPools",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolForCreator",
    inputs: [
      {
        name: "creator",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CreatorPoolCreated",
    inputs: [
      {
        name: "creator",
        type: "address",
        indexed: true,
      },
      {
        name: "pool",
        type: "address",
        indexed: true,
      },
      {
        name: "node",
        type: "address",
        indexed: true,
      },
      {
        name: "creatorCut",
        type: "uint256",
        indexed: false,
      },
      {
        name: "poolName",
        type: "string",
        indexed: false,
      },
    ],
  },
  {
    type: "constant",
    name: "MAX_CREATOR_CUT",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "variable",
    name: "creatorToPool",
    inputs: [
      {
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "variable",
    name: "allPools",
    inputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
] as const;

export const CREATOR_POOL_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_node",
        type: "address",
      },
      {
        internalType: "address",
        name: "_factory",
        type: "address",
      },
      {
        internalType: "address",
        name: "_creator",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_creatorCut",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "_poolName",
        type: "string",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "creator",
        type: "address",
      },
    ],
    name: "InvalidCreator",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidInput",
    type: "error",
  },
  {
    inputs: [],
    name: "TooBigCut",
    type: "error",
  },
  {
    inputs: [],
    name: "TransferEthFailed",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
    ],
    name: "Unauthorized",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroAmountError",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "FanStaked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "RewardClaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "RewardReceived",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "StakeRegisteredToNode",
    type: "event",
  },
  {
    inputs: [],
    name: "CREATOR",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "FACTORY",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_CREATOR_CUT",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "NODE",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PRECISION",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "accRewardPerShare",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claimReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "creatorCut",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "fanStakes",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "cut",
        type: "uint256",
      },
    ],
    name: "isValidCreatorCut",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "pendingRewards",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "poolName",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "registerAsCreatorPool",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "rewardDebt",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "creatorStaked",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalFanStaked",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    type: "function",
    name: "pendingReward",
    inputs: [
      {
        name: "fan",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "reward",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "newStake",
        type: "uint256",
      },
    ],
    name: "updateFanStake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
] as const;

export const NODE_ABI = [
  {
    type: "function",
    name: "createPool",
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
    outputs: [
      {
        internalType: "address",
        name: "poolAddr",
        type: "address",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "getAllPools",
    inputs: [],
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPoolForCreator",
    inputs: [
      {
        internalType: "address",
        name: "creator",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creatorToPool",
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allPools",
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_CREATOR_CUT",
    inputs: [],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CreatorPoolCreated",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "pool",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "creatorCut",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "poolName",
        type: "string",
      },
    ],
  },
] as const;

export const L2_BASE_TOKEN_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        internalType: "string",
        name: "_name",
        type: "string",
      },
      {
        internalType: "string",
        name: "_symbol",
        type: "string",
      },
      {
        internalType: "address",
        name: "_l1Address",
        type: "address",
      },
      {
        internalType: "address",
        name: "_nodeContractAddr",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_minStake",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "FAN_UNSTAKE_COOLDOWN",
    inputs: [],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_CREATORS_PER_NODE",
    inputs: [],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MINIMUM_NODE_STAKE",
    inputs: [],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "addNodeStake",
    inputs: [
      {
        internalType: "address",
        name: "_account",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canUnstake",
    inputs: [
      {
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        internalType: "address",
        name: "creator",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegatedTo",
    inputs: [
      {
        internalType: "address",
        name: "_account",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "delegation",
    inputs: [
      {
        internalType: "address",
        name: "_from",
        type: "address",
      },
      {
        internalType: "address",
        name: "_to",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "removeNodeStake",
    inputs: [
      {
        internalType: "address",
        name: "_account",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stake",
    inputs: [
      {
        internalType: "address",
        name: "_to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stakeAsNode",
    inputs: [
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "stakeOf",
    inputs: [
      {
        internalType: "address",
        name: "_account",
        type: "address",
      },
    ],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "unstake",
    inputs: [
      {
        internalType: "address",
        name: "_from",
        type: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unstake",
    inputs: [
      {
        internalType: "address",
        name: "_from",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_amount",
        type: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unstakeAsNode",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DelegationChanged",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "delegator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "delegatee",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "oldAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "bool",
        name: "increased",
        type: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "FanUnstaked",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "newAmount",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GrantCreatorPool",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NodeStake",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "NodeUnstake",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RevokeCreatorPool",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "creator",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "node",
        type: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Stake",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "staker",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "pool",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Unstake",
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "unstaker",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "pool",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "CreatorLimitReached",
    inputs: [],
  },
  {
    type: "error",
    name: "CreatorToCreatorSake",
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "InsufficientDelegation",
    inputs: [
      {
        internalType: "uint256",
        name: "requested",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "available",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InsufficientFunds",
    inputs: [
      {
        internalType: "uint256",
        name: "requested",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "available",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "InsufficientStake",
    inputs: [
      {
        internalType: "uint256",
        name: "min",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "actual",
        type: "uint256",
      },
    ],
  },
  {
    type: "error",
    name: "MultiNodeStakeError",
    inputs: [],
  },
  {
    type: "error",
    name: "NodeStakeNotAllowed",
    inputs: [
      {
        internalType: "address",
        name: "node",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "SelfStake",
    inputs: [],
  },
  {
    type: "error",
    name: "SelfUnstake",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "UnstakingCooldown",
    inputs: [
      {
        internalType: "address",
        name: "fan",
        type: "address",
      },
      {
        internalType: "address",
        name: "creator",
        type: "address",
      },
    ],
  },
  {
    type: "error",
    name: "ZeroAmountError",
    inputs: [],
  },
] as const;
