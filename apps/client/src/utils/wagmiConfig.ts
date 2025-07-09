import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { chainConfig } from "viem/zksync";

const revolutionTestnet = defineChain({
  ...chainConfig,
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
  },
  blockExplorers: {
    default: {
      name: "Revochain Testnet Explorer",
      url: "https://dev.revoscan.io",
    },
  },
  testnet: true,
});

export const AVAILABLE_CHAINS = [revolutionTestnet];

export const wagmiConfig = createConfig({
  chains: [revolutionTestnet],
  transports: {
    [revolutionTestnet.id]: http(),
  },
});
