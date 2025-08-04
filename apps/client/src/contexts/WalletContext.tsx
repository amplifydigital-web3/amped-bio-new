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
import { useAccount } from "wagmi";
import { trpcClient } from "../utils/trpc";
import { useAuth } from "./AuthContext";

const TIMEOUT_DURATION = 2_000; // 2 seconds in milliseconds
const THROTTLE_DURATION = 3_000; // 3 seconds in milliseconds
const INIT_THROTTLE_DURATION = 3_000; // 3 seconds throttle for initialization attempts

type WalletContextType = {
  connecting: boolean;
};

const WalletContext = createContext<WalletContextType>({ connecting: false });

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser } = useAuth();
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const { connectTo, error } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();

  const lastConnectAttemptRef = useRef(0);
  const lastInitAttemptRef = useRef(0); // Ref to track last initialization attempt

  const _connectingRef = useRef(false);
  const [connecting, _setConnecting] = useState(false);

  const [lastTick, setLastTick] = useState(Date.now());

  const setConnecting = useCallback((value: boolean) => {
    _setConnecting(value);
    _connectingRef.current = value;
  }, []);

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

  const connectWallet = useCallback(async () => {
    try {
      setConnecting(true);

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
    } finally {
      setConnecting(false);
    }
  }, [connectTo, setConnecting]);

  // useEffect to force web3auth to be ready and initialized
  useEffect(() => {
    console.info("Checking Web3Auth initialization status...", dataWeb3Auth?.web3Auth?.status);
    if (!dataWeb3Auth) return;

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
      _connectingRef.current === false
    ) {
      const now = Date.now();
      if (now - lastConnectAttemptRef.current >= THROTTLE_DURATION) {
        console.info("Attempting to connect wallet due to user login", {
          authUser: !!authUser,
          dataWeb3Auth: !!dataWeb3Auth,
          account: account.status,
          connecting: _connectingRef.current,
        });
        lastConnectAttemptRef.current = now;
        connectWallet();
      }
    }
  }, [authUser, dataWeb3Auth, account.status, connectWallet, lastTick]);

  useEffect(() => {
    if (!authUser && account.status === "connected") {
      console.info("Disconnecting wallet due to user logout");
      web3AuthDisconnect({ cleanup: true });
    }
  }, [authUser, account.status, web3AuthDisconnect]);

  return (
    <WalletContext.Provider value={{ connecting: connecting }}>{children}</WalletContext.Provider>
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
