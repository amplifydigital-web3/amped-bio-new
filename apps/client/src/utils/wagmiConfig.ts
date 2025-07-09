import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { chainConfig } from "viem/zksync";
// import { Web3Auth, WEB3AUTH_NETWORK } from "@web3auth/modal";

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

// const web3AuthInstance = new Web3Auth({
//   clientId: "YOUR_WEB3AUTH_CLIENT_ID",
//   chainConfig,
//   privateKeyProvider,
//   web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
// });

export const wagmiConfig = createConfig({
  chains: [revolutionTestnet],
  transports: {
    [revolutionTestnet.id]: http(),
  },
});
