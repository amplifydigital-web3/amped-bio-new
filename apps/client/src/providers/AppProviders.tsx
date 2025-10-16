import { ReactNode } from "react";
import { Web3AuthProvider } from "@web3auth/modal/react";
import web3AuthContextConfig from "../utils/web3authContext";
import { WagmiProvider as Web3AuthWagmiProvider } from "@web3auth/modal/react/wagmi";
import { Web3AuthWalletProvider } from "./Web3AuthWalletProvider";

import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { MetaMaskWalletProvider } from "./MetaMaskWalletProvider";
import { AVAILABLE_CHAINS } from "@amped/web3";
import { isForceMetamask } from "../utils/auth";

// Standard Wagmi config for direct MetaMask mode
const wagmiConfig = createConfig({
  chains: AVAILABLE_CHAINS,
  connectors: [injected()],
  transports: AVAILABLE_CHAINS.reduce((obj: Record<number, ReturnType<typeof http>>, chain) => {
    obj[chain.id] = http();
    return obj;
  }, {} as Record<number, ReturnType<typeof http>>),
});

export function AppProviders({ children }: { children: ReactNode }) {
  if (isForceMetamask) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <MetaMaskWalletProvider>{children}</MetaMaskWalletProvider>
      </WagmiProvider>
    );
  }

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <Web3AuthWagmiProvider>
        <Web3AuthWalletProvider>{children}</Web3AuthWalletProvider>
      </Web3AuthWagmiProvider>
    </Web3AuthProvider>
  );
}
