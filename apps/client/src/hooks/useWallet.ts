import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  useWeb3Auth,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
  useIdentityToken,
} from "@web3auth/modal/react";
import { useCallback } from "react";
import { trpcClient } from "../utils/trpc";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";

export const useMetaMaskWallet = () => {
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const account = useAccount();

  const handleConnect = useCallback(async () => {
    // Prioritize specific injected wallets like MetaMask over generic "Injected"
    const preferredOrder = ["io.metamask", "app.phantom", "injected"]; // Order by preference

    for (const connectorId of preferredOrder) {
      const connector = connectors.find(c => c.id === connectorId && c.type === "injected");
      if (connector) {
        try {
          connect({ connector });
          return;
        } catch (error) {
          console.log(`Failed to connect with ${connector.name}:`, error);
        }
      }
    }

    console.log("No preferred injected connector available");
  }, [connect, connectors]);

  // Check if injected connectors are available
  const injectedConnectorAvailable =
    connectors.some(connector => connector.type === "injected") &&
    typeof window !== "undefined" &&
    !!window.ethereum;

  return {
    ...account,
    connect: handleConnect,
    disconnect,
    isReady: injectedConnectorAvailable, // Ready when injected connector is available
  };
};

export const useWeb3AuthWallet = () => {
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const { connectTo, error } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();
  const { getIdentityToken } = useIdentityToken();

  const getTokenAndConnect = useCallback(async () => {
    try {
      const { walletToken } = await trpcClient.auth.getWalletToken.query();
      console.log("Fetched wallet token:", walletToken);
      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: walletToken.token,
        extraLoginOptions: { isUserIdCaseSensitive: false },
      });
    } catch (err) {
      console.error("Error fetching wallet token:", err);
    }
  }, [connectTo]);

  return {
    ...dataWeb3Auth,
    ...account,
    connect: getTokenAndConnect,
    disconnect: web3AuthDisconnect,
    isReady: dataWeb3Auth.status === "ready",
    error,
    getIdentityToken,
  };
};
