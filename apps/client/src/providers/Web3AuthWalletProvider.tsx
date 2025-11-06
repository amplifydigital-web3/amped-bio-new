import { useEffect, ReactNode, useRef, useState } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { useAuth } from "../contexts/AuthContext";
import { WalletContext } from "../contexts/WalletContext";
import { useWeb3AuthWallet } from "../hooks/useWallet";
import { trpcClient } from "../utils/trpc";

const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds

export const Web3AuthWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser } = useAuth();
  const wallet = useWeb3AuthWallet();

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isUSD, setIsUSD] = useState(false);

  const balance = useBalance({
    address: wallet.address,
    query: { refetchInterval: 10000 },
  });

  const lastConnectAttemptRef = useRef(0);

  useEffect(() => {
    if (wallet.error) {
      console.error("Wallet connection error:", wallet.error);
    }
  }, [wallet.error]);

  useEffect(() => {
    if (authUser && wallet && wallet.status !== "connected" && wallet.status !== "connecting") {
      const now = Date.now();
      if (now - lastConnectAttemptRef.current >= THROTTLE_DURATION) {
        lastConnectAttemptRef.current = now;
        wallet.connect();
      }
    }
  }, [authUser, wallet]);

  useEffect(() => {
    if (!authUser && wallet.status === "connected") {
      console.info("Disconnecting wallet due to user logout");
      wallet.disconnect();
    }
  }, [authUser, wallet.status, wallet.disconnect]);

  useEffect(() => {
    const linkAddress = async () => {
      if (wallet.status === "connected" && wallet.address) {
        try {
          // @ts-ignore
          const idToken = await wallet.getIdentityToken();
          // @ts-ignore
          const pubKey = await wallet.provider?.request({ method: "public_key" });
          setPublicKey(pubKey as string);

          await trpcClient.wallet.linkWalletAddress.mutate({
            publicKey: pubKey as string,
            idToken: idToken,
          });
          console.info("Wallet address linked successfully");
        } catch (err) {
          if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
            console.info("Wallet already linked.");
          } else {
            console.error("Error linking wallet address:", err);
          }
        }
      }
    };
    linkAddress();
  }, [wallet.status, wallet.address, wallet]);

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
        publicKey,
        address: wallet.address,
        getIdentityToken: wallet.getIdentityToken,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
