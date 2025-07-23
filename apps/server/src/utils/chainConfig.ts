import { env } from "../env";

// Centralized chain configuration for consistent use across the application
export const getChainConfig = () => {
  return {
    id: 73861,
    name: "Revochain Testnet",
    network: "revochain-testnet",
    nativeCurrency: {
      name: "Revochain Testnet",
      symbol: "tREVO",
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: ["https://dev.revolutionchain.io"],
      },
      public: {
        http: ["https://dev.revolutionchain.io"],
      },
    },
    blockExplorers: {
      default: {
        name: "Revochain Testnet Explorer",
        url: "https://dev.revoscan.io",
      },
    },
    testnet: true,
  };
};

// Export the symbol for convenience
export const getCurrencySymbol = () => {
  return "tREVO";
};
