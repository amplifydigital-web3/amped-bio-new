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
    if (connectors[0]) {
      connect({ connector: connectors[0] });
    }
  }, [connect, connectors]);

  return {
    ...account,
    connect: handleConnect,
    disconnect,
    isReady: account.status === "connected",
  };
};

export const useWeb3AuthWallet = () => {
  const {
    disconnect: web3AuthDisconnect,
  } = useWeb3AuthDisconnect();
  const { connectTo, error } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();
  const { getIdentityToken } = useIdentityToken();

  const getTokenAndConnect = useCallback(async () => {
    try {
      const token = await trpcClient.auth.getWalletToken.query();
      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: token.walletToken,
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
    isReady: dataWeb3Auth.status === 'ready',
    error,
    getIdentityToken,
  };
};