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
  getIdentityToken?: () => Promise<string> | undefined;
  /** True only when a live wallet is connected and it is this account's wallet. */
  isWeb3Wallet: boolean;
  /** The wallet the browser can sign with right now, which may differ from `address`. */
  liveAddress?: `0x${string}` | undefined;
  /** The live wallet belongs to another account (an account switch in one browser). */
  walletMismatch: boolean;
  /** Signs out of the wallet SDK, clears its browser state and caches, then signs out of Amped.Bio. */
  signOutEverywhere: () => Promise<void>;
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
  getIdentityToken: undefined,
  isWeb3Wallet: false,
  liveAddress: undefined,
  walletMismatch: false,
  signOutEverywhere: async () => {},
});

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
};
