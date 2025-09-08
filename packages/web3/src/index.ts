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
    inputs: [
      {
        internalType: "address",
        name: "creator",
        type: "address",
      },
    ],
    name: "getPoolForCreator",
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
] as const;
