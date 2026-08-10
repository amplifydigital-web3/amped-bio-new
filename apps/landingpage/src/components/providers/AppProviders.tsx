"use client";

import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/trpc";
import { wagmiConfig } from "@/lib/wagmiConfig";
import { AuthProvider } from "@/contexts/AuthContext";
import { NdauWalletProvider } from "@/ndau-wallet/contexts/NdauWalletContext";

export function AppProviders({ children }: { children: ReactNode }) {
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
