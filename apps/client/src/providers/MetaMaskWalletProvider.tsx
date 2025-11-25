import { ReactNode, useState, useEffect } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { WalletContext } from "../contexts/WalletContext";
import { useMetaMaskWallet } from "../hooks/useWallet";
import { trpcClient } from "../utils/trpc";
import { useAuth } from "../contexts/AuthContext";

export const MetaMaskWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser } = useAuth();
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

  const balance = useBalance({
    address: wallet.address,
    query: { refetchInterval: 10000 },
  });

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
        address: wallet.address,
        getIdentityToken: undefined,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
