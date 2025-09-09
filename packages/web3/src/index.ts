import { type Address } from "viem";
import { chainConfig } from "viem/zksync";

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
    NODE: { address: "0x0000000000000000000000000000000000000000" as Address },
    CREATOR_POOL_FACTORY: { address: "0x0000000000000000000000000000000000000000" as Address },
  },
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
    NODE: { address: "0x019bbe745b5c9b70060408Bf720B1E5172EEa5A3" as Address },
    CREATOR_POOL_FACTORY: { address: "0xd4A49616cB954A2338ea1794C1EDa9d1254B23f0" as Address },
  },
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
