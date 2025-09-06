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
  [libertasTestnet.id]: "0x019bbe745b5c9b70060408Bf720B1E5172EEa5A3" as Address,
  [revolutionDevnet.id]: "0x0000000000000000000000000000000000000000" as Address,
};
