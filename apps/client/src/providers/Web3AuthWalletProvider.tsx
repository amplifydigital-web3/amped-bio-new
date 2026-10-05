import { useEffect, ReactNode, useRef, useState, useMemo } from "react";
import { useBalance } from "wagmi";
import { TRPCClientError } from "@trpc/client";
import { useAuth } from "@repo/ui";
import { WalletContext } from "../contexts/WalletContext";
import { useWeb3AuthWallet } from "../hooks/useWallet";
import { trpcClient } from "@repo/ui";
import { type Address } from "viem";

const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds
const TOKEN_REFRESH_CHECK_INTERVAL = 30_000; // Check every 30 seconds if token needs refresh
const TOKEN_EXPIRATION_BUFFER = 60_000; // Refresh if token expires in less than 1 minute

export const Web3AuthWalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser, updateAuthUser } = useAuth();
  const wallet = useWeb3AuthWallet();
  const {
    status: walletStatus,
    address: walletAddress,
    connect: walletConnect,
    disconnect: walletDisconnect,
    getIdentityToken: walletGetIdentityToken,
    provider: walletProvider,
    error: walletError,
  } = wallet;

  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isUSD, setIsUSD] = useState(false);
  const [tokenExpiration, setTokenExpiration] = useState<number | null>(() => {
    const storedExpiration = localStorage.getItem("walletTokenExpiration");
    return storedExpiration ? parseInt(storedExpiration, 10) : null;
  });

  const lastConnectAttemptRef = useRef(0);
  const linkAddressRunningRef = useRef(false);
  const refreshTokenRunningRef = useRef(false);

  useEffect(() => {
    const updateTokenExpirationFromStorage = () => {
      const storedExpiration = localStorage.getItem("walletTokenExpiration");
      if (storedExpiration) {
        setTokenExpiration(parseInt(storedExpiration, 10));
      }
    };

    updateTokenExpirationFromStorage();

    const handleStorageChange = () => {
      updateTokenExpirationFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);

    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (walletError) {
      console.error("Wallet connection error:", walletError);
    }
  }, [walletError]);

  useEffect(() => {
    if (authUser && walletStatus !== "connected" && walletStatus !== "connecting") {
      const now = Date.now();
      if (now - lastConnectAttemptRef.current >= THROTTLE_DURATION) {
        lastConnectAttemptRef.current = now;
        walletConnect();
      }
    }
  }, [authUser, walletStatus, walletConnect]);

  useEffect(() => {
    if (!authUser && walletStatus === "connected") {
      console.info("Disconnecting wallet due to user logout");
      localStorage.removeItem("walletTokenExpiration");
      walletDisconnect();
    }
  }, [authUser, walletStatus, walletDisconnect]);

  useEffect(() => {
    const getAndSetPublicKey = async () => {
      if (walletProvider) {
        try {
          // @ts-ignore
          const pubKey = await walletProvider.request({ method: "public_key" });
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
  }, [walletProvider, setPublicKey]);

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
          walletStatus === "connected" &&
          walletAddress &&
          !authUser.wallet &&
          publicKey
        ) {
          try {
            // @ts-ignore
            const idToken = await walletGetIdentityToken();

            await trpcClient.wallet.linkWalletAddress.mutate({
              publicKey: publicKey as string,
              idToken: idToken,
            });
            console.info("Wallet address linked successfully");
            updateAuthUser({ wallet: walletAddress });
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
  }, [authUser, walletStatus, walletAddress, walletGetIdentityToken, publicKey, updateAuthUser]);

  useEffect(() => {
    const refreshTokenIfNeeded = async () => {
      if (!authUser || walletStatus !== "connected" || refreshTokenRunningRef.current) {
        return;
      }

      const now = Date.now();

      if (!tokenExpiration) {
        return;
      }

      const timeUntilExpiration = tokenExpiration - now;

      if (timeUntilExpiration <= TOKEN_EXPIRATION_BUFFER) {
        console.log("Token expiring soon, refreshing...");

        refreshTokenRunningRef.current = true;

        try {
          await walletDisconnect();
          await walletConnect();
          console.info("Token refreshed successfully");
        } catch (error) {
          console.error("Error refreshing token:", error);
        } finally {
          refreshTokenRunningRef.current = false;
        }
      }
    };

    const interval = setInterval(refreshTokenIfNeeded, TOKEN_REFRESH_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [authUser, walletStatus, walletConnect, walletDisconnect, tokenExpiration]);

  const address = useMemo(() => {
    return (authUser?.wallet ?? walletAddress) as Address | undefined;
  }, [authUser, walletAddress]);

  const balance = useBalance({
    address: address,
    query: { refetchInterval: 10000 },
  });

  const updateBalanceDelayed = () => {
    setTimeout(() => balance?.refetch(), 2000);
  };

  return (
    <WalletContext.Provider
      value={{
        connecting: walletStatus === "connecting",
        connect: walletConnect,
        disconnect: walletDisconnect,
        balance,
        isUSD,
        setIsUSD,
        updateBalanceDelayed,
        publicKey,
        address: address,
        getIdentityToken: walletGetIdentityToken,
        isWeb3Wallet: walletAddress !== undefined,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
