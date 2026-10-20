import { ReactNode, useCallback, useState, useEffect, useMemo } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { WalletContext } from "../contexts/WalletContext";
import { useMetaMaskWallet } from "../hooks/useWallet";
import { trpcClient } from "@repo/ui";
import { queryClient, useAuth } from "@repo/ui";
import { type Address } from "viem";
import { clearWalletBrowserState, isWalletMismatch } from "../utils/walletSession";

export const MetaMaskWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser, signOut } = useAuth();
  const wallet = useMetaMaskWallet();
  const [isUSD, setIsUSD] = useState(false);

  useEffect(() => {
    if (wallet.status !== "connected" && wallet.status !== "connecting" && wallet.isReady) {
      wallet.connect();
    }
  }, [wallet.status, wallet.isReady, wallet.connect]);

  useEffect(() => {
    const linkAddress = async () => {
      if (authUser && wallet.status === "connected" && wallet.address) {
        try {
          // In development mode, we can link the wallet directly using just the address
          // In production, MetaMask may need a different approach since it doesn't provide ID tokens like Web3Auth
          await trpcClient.wallet.linkWalletAddress.mutate({
            address: wallet.address,
          });
          console.info("MetaMask wallet address linked successfully");
        } catch (err) {
          if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
            console.info("Wallet already linked.");
          } else {
            console.error("Error linking MetaMask wallet address:", err);
          }
        }
      }
    };
    linkAddress();
  }, [authUser, wallet.status, wallet.address, wallet]);

  const address = useMemo(() => {
    return (authUser?.wallet ?? wallet.address) as Address | undefined;
  }, [authUser, wallet.address]);

  const balance = useBalance({
    address: address,
    query: { refetchInterval: 10000 },
  });

  // MetaMask owns its accounts; the app cannot switch them. A mismatch blocks
  // signing and the reconnect card tells the person to change account.
  const walletMismatch = isWalletMismatch(authUser?.wallet, wallet.address);

  const signOutEverywhere = useCallback(async () => {
    try {
      wallet.disconnect();
    } catch (error) {
      console.warn("[wallet-session] MetaMask disconnect failed", error);
    }
    clearWalletBrowserState();
    await signOut();
    queryClient.clear();
  }, [wallet, signOut]);

  const updateBalanceDelayed = () => {
    setTimeout(() => balance?.refetch(), 2000);
  };

  return (
    <WalletContext.Provider
      value={{
        connecting: wallet.status === "connecting",
        connect: wallet.connect,
        disconnect: wallet.disconnect,
        balance,
        isUSD,
        setIsUSD,
        updateBalanceDelayed,
        publicKey: null,
        address: address,
        getIdentityToken: undefined,
        isWeb3Wallet: wallet?.address !== undefined && !walletMismatch,
        liveAddress: wallet.address,
        walletMismatch,
        signOutEverywhere,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
