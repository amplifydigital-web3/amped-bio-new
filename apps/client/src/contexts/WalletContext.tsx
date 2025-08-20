import {
  createContext,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
  useState,
  useContext,
} from "react";
import { useWeb3AuthDisconnect, useWeb3AuthConnect, useWeb3Auth } from "@web3auth/modal/react";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";
import { useAccount, useBalance, type UseBalanceReturnType } from "wagmi";
import { trpcClient } from "../utils/trpc";
import { useAuth } from "./AuthContext";

const TIMEOUT_DURATION = 10_000; // 2 seconds in milliseconds
const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds
const INIT_THROTTLE_DURATION = 3_000; // 3 seconds throttle for initialization attempts

type WalletContextType = {
  connecting: boolean;
  connect: () => Promise<void>;

  balance?: UseBalanceReturnType<{
    decimals: number;
    formatted: string;
    symbol: string;
    value: bigint;
  }>;
  isUSD: boolean;
  setIsUSD: (value: boolean) => void;

  updateBalanceDelayed: () => void;
};

const WalletContext = createContext<WalletContextType>({
  connecting: false,
  connect: async () => {},

  isUSD: false,
  setIsUSD: () => {},

  updateBalanceDelayed: () => {},
});

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser } = useAuth();
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const { connectTo, error } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();

  const balance = useBalance();
  const [isUSD, setIsUSD] = useState(false);

  const lastConnectAttemptRef = useRef(0);
  const lastInitAttemptRef = useRef(0); // Ref to track last initialization attempt

  const [lastTick, setLastTick] = useState(Date.now());

  useEffect(() => {
    if (error) {
      console.error("Web3Auth connection error:", error);
    }
  }, [error]);

  // Update last tick every second
  // This can be used to trigger re-renders or other effects based on time
  useEffect(() => {
    setInterval(() => {
      setLastTick(Date.now());
    }, 1000);
  }, []);

  const getTokenAndConnect = useCallback(async () => {
    try {
      const token = await trpcClient.auth.getWalletToken.query();

      // await new Promise((_, reject) =>
      //   setTimeout(() => reject(new Error("Connection timed out")), TIMEOUT_DURATION)
      // );

      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: token.walletToken,
        extraLoginOptions: {
          isUserIdCaseSensitive: false,
        },
      });

      console.log("Wallet connected successfully");
    } catch (error) {
      console.error("Error fetching wallet token:", error);
    }
  }, [connectTo]);

  // useEffect to force web3auth to be ready and initialized
  useEffect(() => {
    if (import.meta.env.VITE_SHOW_WALLET !== "true") {
      return;
    }

    if (!dataWeb3Auth) return;
    // console.info("Checking Web3Auth initialization status...", dataWeb3Auth?.web3Auth?.status);

    if (
      dataWeb3Auth.web3Auth?.status &&
      ["ready", "connected", "initialized", "connecting"].includes(
        dataWeb3Auth.web3Auth?.status
      ) === false
    ) {
      const now = Date.now();
      if (now - lastInitAttemptRef.current >= INIT_THROTTLE_DURATION) {
        console.info(
          "Web3Auth not ready, attempting to initialize...",
          dataWeb3Auth.web3Auth?.status
        );
        lastInitAttemptRef.current = now;
        dataWeb3Auth.web3Auth
          ?.init({ signal: AbortSignal.timeout(TIMEOUT_DURATION) })
          .then(() => {
            console.info("Web3Auth initialized successfully");
          })
          .catch(error => {
            console.error("Error initializing Web3Auth:", error);
          });
      }
    }
  }, [dataWeb3Auth, lastTick]);

  useEffect(() => {
    if (
      authUser &&
      dataWeb3Auth &&
      account.status !== "connected" &&
      dataWeb3Auth.status !== "connecting"
    ) {
      const now = Date.now();
      if (now - lastConnectAttemptRef.current >= THROTTLE_DURATION) {
        console.info("Attempting to connect wallet due to user login", {
          authUser: !!authUser,
          dataWeb3Auth: !!dataWeb3Auth,
          account: account.status,
          connecting: dataWeb3Auth.status,
        });
        lastConnectAttemptRef.current = now;
        getTokenAndConnect();
      }
    }
  }, [authUser, dataWeb3Auth, account.status, getTokenAndConnect, lastTick]);

  useEffect(() => {
    if (!authUser && account.status === "connected") {
      console.info("Disconnecting wallet due to user logout");
      web3AuthDisconnect();
    }
  }, [authUser, account.status, web3AuthDisconnect]);

  const updateBalanceDelayed = () => {
    setTimeout(() => {
      balance?.refetch();
    }, 2000);
  };

  return (
    <WalletContext.Provider
      value={{
        connecting: dataWeb3Auth.status === "connecting",
        connect: getTokenAndConnect,

        balance,
        isUSD,
        setIsUSD,

        updateBalanceDelayed,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useWalletContext = () => {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }

  return context;
};
