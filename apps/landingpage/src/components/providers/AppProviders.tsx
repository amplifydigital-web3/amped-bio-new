"use client";

import { ReactNode } from "react";
import { Web3AuthProvider } from "@web3auth/modal/react";
import web3AuthContextConfig from "../lib/web3authContext";
import { WagmiProvider as Web3AuthWagmiProvider } from "@web3auth/modal/react/wagmi";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/trpc";
import { wagmiConfig as rawWagmiConfig } from "@/lib/wagmiConfig";
import { AuthProvider } from "@/contexts/AuthContext";
import { NdauWalletProvider } from "@/ndau-wallet/contexts/NdauWalletContext";

// Standard Wagmi config for direct MetaMask mode (fallback)
const wagmiConfig = createConfig({
  chains: rawWagmiConfig.chains,
  connectors: [injected()],
  transports: rawWagmiConfig.chains.reduce(
    (obj: Record<number, ReturnType<typeof http>>, chain) => {
      obj[chain.id] = http();
      return obj;
    },
    {} as Record<number, ReturnType<typeof http>>
  ),
});

const isForceMetamask = process.env.NEXT_PUBLIC_AUTH_MODE === "force_metamask";

export function AppProviders({ children }: { children: ReactNode }) {
  if (isForceMetamask) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NdauWalletProvider>{children}</NdauWalletProvider>
          </AuthProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <Web3AuthWagmiProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NdauWalletProvider>{children}</NdauWalletProvider>
          </AuthProvider>
        </QueryClientProvider>
      </Web3AuthWagmiProvider>
    </Web3AuthProvider>
  );
}