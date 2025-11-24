import { useEffect, ReactNode, useRef, useState } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { useAuth } from "../contexts/AuthContext";
import { WalletContext } from "../contexts/WalletContext";
import { useWeb3AuthWallet } from "../hooks/useWallet";
import { trpcClient } from "../utils/trpc";

const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds

export const Web3AuthWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser, updateAuthUser } = useAuth();
  const wallet = useWeb3AuthWallet();

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isUSD, setIsUSD] = useState(false);

  const balance = useBalance({
    address: wallet.address,
    query: { refetchInterval: 10000 },
  });

  const lastConnectAttemptRef = useRef(0);
  const linkAddressRunningRef = useRef(false);

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
    const getAndSetPublicKey = async () => {
      if (wallet.provider) {
        try {
          // @ts-ignore
          const pubKey = await wallet.provider.request({ method: "public_key" });
          setPublicKey(pubKey as string);
        } catch (error) {
          console.error("Error getting public key:", error);
          setPublicKey(null);
        }
      } else {
        setPublicKey(null);
      }
    };

    getAndSetPublicKey();
  }, [wallet.provider, setPublicKey]);

  useEffect(() => {
    const linkAddress = async () => {
      // Prevent parallel execution of linkAddress
      if (linkAddressRunningRef.current) {
        return;
      }
      linkAddressRunningRef.current = true;

      try {
        // Link wallet if user is authenticated, wallet is connected, and user doesn't have a wallet linked yet
        if (
          authUser &&
          wallet.status === "connected" &&
          wallet.address &&
          !authUser.wallet &&
          publicKey
        ) {
          try {
            // @ts-ignore
            const idToken = await wallet.getIdentityToken();

            await trpcClient.wallet.linkWalletAddress.mutate({
              publicKey: publicKey as string,
              idToken: idToken,
            });
            console.info("Wallet address linked successfully");
            updateAuthUser({ wallet: wallet.address });
          } catch (err) {
            if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
              console.info("Wallet already linked.");
            } else {
              console.error("Error linking wallet address:", err);
            }
          }
        }
      } finally {
        // Reset the flag when the function completes (whether successfully or with error)
        linkAddressRunningRef.current = false;
      }
    };
    linkAddress();
  }, [authUser, wallet.status, wallet.address, wallet, publicKey]);

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
