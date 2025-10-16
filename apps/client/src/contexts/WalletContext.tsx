import { createContext, useContext } from "react";
import type { UseBalanceReturnType } from "wagmi";

export type WalletContextType = {
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  balance?: UseBalanceReturnType;
  isUSD: boolean;
  setIsUSD: (value: boolean) => void;
  updateBalanceDelayed: () => void;
  publicKey: string | null;
  address?: `0x${string}` | undefined;
};

export const WalletContext = createContext<WalletContextType>({
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
  isUSD: false,
  setIsUSD: () => {},
  updateBalanceDelayed: () => {},
  publicKey: null,
  address: undefined,
});

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
};