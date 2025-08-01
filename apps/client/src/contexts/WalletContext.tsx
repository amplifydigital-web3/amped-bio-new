import {
  createContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
  useContext,
} from "react";
import { useWeb3AuthDisconnect, useWeb3AuthConnect, useWeb3Auth } from "@web3auth/modal/react";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";
import { useAccount } from "wagmi";
import { trpcClient } from "../utils/trpc";
import { AUTH_STORAGE_KEYS } from "../constants/auth-storage";
import { useAuth } from "./AuthContext";

// Types
interface ConnectionState {
  isConnecting: boolean;
  isConnected: boolean | null;
  error: string | null;
}

interface WalletContextType {
  connectionState: ConnectionState;
  reconnect: () => Promise<void>;
}

// Utils
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;

  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(Buffer.from(paddedBase64, "base64").toString("utf8"));

    if (!payload?.exp) return true;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { authUser } = useAuth();
  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const { connectTo } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnecting: false,
    isConnected: null,
    error: null,
  });

  // Refs
  const connectionAttemptRef = useRef(false);
  const reconnectIntervalRef = useRef<number | null>(null);

  // Helper to update connection state
  const updateConnectionState = useCallback((updates: Partial<ConnectionState>) => {
    setConnectionState(prev => ({ ...prev, ...updates }));
  }, []);

  // Safe disconnect with error logging
  const safeDisconnect = useCallback(async () => {
    try {
      console.log("👋 Attempting to disconnect wallet...");
      await web3AuthDisconnect({ cleanup: true });
      console.log("✅ Wallet disconnected successfully");
      updateConnectionState({ isConnected: false, error: null });
    } catch (error) {
      console.warn("⚠️ Wallet disconnect failed:", error);

      // Log disconnect error details
      if (error instanceof Error) {
        console.error("🔍 Disconnect error details:", {
          message: error.message,
          name: error.name,
          stack: error.stack,
          code: (error as any).code,
        });
      }

      // Still update state as disconnected since we tried
      updateConnectionState({ isConnected: false, error: "Disconnect failed" });
    }
  }, [web3AuthDisconnect, updateConnectionState]);

  // Get wallet token from backend with detailed error logging
  const getWalletToken = useCallback(async (): Promise<string | null> => {
    try {
      console.log("📡 Requesting wallet token from backend...");
      const response = await trpcClient.auth.getWalletToken.query();
      console.log("✅ Wallet token received successfully");
      return response.walletToken;
    } catch (error) {
      console.error("❌ Failed to get wallet token:", error);

      // Log comprehensive error details
      if (error instanceof Error) {
        console.error("🔍 Token request error analysis:", {
          message: error.message,
          name: error.name,
          stack: error.stack,
          code: (error as any).code,
          status: (error as any).status,
          statusText: (error as any).statusText,
          type: (error as any).type,
        });

        // Log HTTP response details if available
        if ((error as any).response) {
          console.error("🌐 HTTP Response details:", {
            status: (error as any).response.status,
            statusText: (error as any).response.statusText,
            data: (error as any).response.data,
            headers: (error as any).response.headers,
          });
        }

        // Log request details if available
        if ((error as any).request) {
          console.error("📤 HTTP Request details:", {
            url: (error as any).request.url,
            method: (error as any).request.method,
            headers: (error as any).request.headers,
          });
        }

        // Log tRPC specific details if available
        if ((error as any).data) {
          console.error("🔧 tRPC Error data:", (error as any).data);
        }

        if ((error as any).shape) {
          console.error("📋 tRPC Error shape:", (error as any).shape);
        }
      } else {
        console.error("🤷 Non-standard error object:", JSON.stringify(error, null, 2));
      }

      return null;
    }
  }, []);

  // Connect to Web3Auth with comprehensive error logging
  const connectToWeb3Auth = useCallback(
    async (token: string): Promise<boolean> => {
      try {
        console.log("🔗 Attempting Web3Auth connection...");
        console.log("🔧 Connection parameters:", {
          connector: WALLET_CONNECTORS.AUTH,
          authConnection: AUTH_CONNECTION.CUSTOM,
          authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
          hasIdToken: !!token,
          tokenLength: token.length,
          extraLoginOptions: {
            isUserIdCaseSensitive: false,
          },
        });

        await connectTo(WALLET_CONNECTORS.AUTH, {
          authConnection: AUTH_CONNECTION.CUSTOM,
          authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
          idToken: token,
          extraLoginOptions: {
            isUserIdCaseSensitive: false,
          },
        });

        console.log("✅ Web3Auth connection successful");
        return true;
      } catch (error) {
        console.error("❌ Web3Auth connection failed:", error);

        // Log comprehensive error details
        if (error instanceof Error) {
          console.error("🔍 Web3Auth connection error analysis:", {
            message: error.message,
            name: error.name,
            stack: error.stack,
            code: (error as any).code,
            type: (error as any).type,
            reason: (error as any).reason,
            details: (error as any).details,
          });

          // Log Web3Auth specific error info
          if ((error as any).info) {
            console.error("ℹ️ Web3Auth error info:", (error as any).info);
          }

          if ((error as any).data) {
            console.error("📊 Web3Auth error data:", (error as any).data);
          }

          if ((error as any).cause) {
            console.error("🔗 Web3Auth error cause:", (error as any).cause);
          }

          // Log wallet-specific error details
          if ((error as any).walletError) {
            console.error("👛 Wallet error details:", (error as any).walletError);
          }

          // Log authentication specific errors
          if ((error as any).authError) {
            console.error("🔐 Auth error details:", (error as any).authError);
          }

          // Additional Web3Auth error properties
          const additionalProps: Record<string, any> = {};
          Object.keys(error as any).forEach(key => {
            if (
              ![
                "message",
                "name",
                "stack",
                "code",
                "type",
                "reason",
                "details",
                "info",
                "data",
                "cause",
                "walletError",
                "authError",
              ].includes(key)
            ) {
              try {
                additionalProps[key] = (error as any)[key];
              } catch (e) {
                additionalProps[key] = "[Error accessing property]";
              }
            }
          });

          if (Object.keys(additionalProps).length > 0) {
            console.error("🔍 Additional Web3Auth error properties:", additionalProps);
          }
        } else {
          console.error("🤷 Non-standard Web3Auth error:", JSON.stringify(error, null, 2));
        }

        return false;
      }
    },
    [connectTo]
  );

  // Main connection function with detailed logging
  const connectWallet = useCallback(async (): Promise<boolean> => {
    console.log("🚀 Starting wallet connection attempt");

    // Prevent parallel connections
    if (connectionAttemptRef.current) {
      console.log("⏸️ Connection attempt blocked - another attempt in progress");
      return false;
    }

    connectionAttemptRef.current = true;
    updateConnectionState({ isConnecting: true, error: null });
    console.log("🔄 Connection state updated: connecting...");

    try {
      // Check if user is authenticated
      if (!authUser) {
        console.log("❌ Connection failed: User not authenticated");
        updateConnectionState({ isConnecting: false, error: "User not authenticated" });
        return false;
      }
      console.log("✅ User authenticated");

      // Check token validity
      const jwtToken = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
      if (!jwtToken) {
        console.log("❌ Connection failed: No JWT token found");
        updateConnectionState({ isConnecting: false, error: "No token found" });
        return false;
      }

      if (isTokenExpired(jwtToken)) {
        console.log("❌ Connection failed: Token is expired");
        updateConnectionState({ isConnecting: false, error: "Token expired" });
        return false;
      }
      console.log("✅ JWT token is valid");

      // Check Web3Auth readiness
      const web3AuthReady =
        dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing && dataWeb3Auth?.web3Auth;

      console.log("Web3Auth status:", {
        isInitialized: dataWeb3Auth?.isInitialized,
        isInitializing: dataWeb3Auth?.isInitializing,
        hasWeb3Auth: !!dataWeb3Auth?.web3Auth,
        ready: web3AuthReady,
      });

      if (!web3AuthReady) {
        console.log("⏳ Connection postponed: Web3Auth not ready");
        updateConnectionState({ isConnecting: false, error: "Web3Auth not ready" });
        return false;
      }
      console.log("✅ Web3Auth is ready");

      // Check if already connected
      if (dataWeb3Auth?.isConnected) {
        console.log("✅ Wallet already connected");
        updateConnectionState({ isConnecting: false, isConnected: true });
        return true;
      }

      // Get wallet token and connect
      console.log("🔑 Requesting wallet token from backend...");
      const walletToken = await getWalletToken();
      if (!walletToken) {
        console.log("❌ Connection failed: Could not get wallet token");
        updateConnectionState({ isConnecting: false, error: "Failed to get wallet token" });
        return false;
      }
      console.log("✅ Wallet token received");

      console.log("🔗 Connecting to Web3Auth...");
      const connected = await connectToWeb3Auth(walletToken);

      if (connected) {
        console.log("🎉 Wallet connection successful!");
        updateConnectionState({ isConnecting: false, isConnected: true });
        return true;
      } else {
        console.log("❌ Web3Auth connection failed");
        updateConnectionState({ isConnecting: false, error: "Web3Auth connection failed" });
        return false;
      }
    } catch (error) {
      console.error("💥 Unexpected error in connectWallet:", error);

      // Comprehensive error analysis
      let errorMessage = "Unknown error";
      let errorDetails: Record<string, any> = {};

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
          type: (error as any).type,
          status: (error as any).status,
          statusText: (error as any).statusText,
        };

        console.error("🔍 connectWallet error analysis:", errorDetails);

        // Additional error properties that might contain useful info
        const additionalInfo: Record<string, any> = {};
        Object.keys(error as any).forEach(key => {
          if (!["name", "message", "stack", "code", "type", "status", "statusText"].includes(key)) {
            try {
              additionalInfo[key] = (error as any)[key];
            } catch (e) {
              additionalInfo[key] = "[Error accessing property]";
            }
          }
        });

        if (Object.keys(additionalInfo).length > 0) {
          console.error("🔍 Additional connectWallet error properties:", additionalInfo);
        }

        // Log specific error contexts
        if ((error as any).context) {
          console.error("🎯 Error context:", (error as any).context);
        }

        if ((error as any).originalError) {
          console.error("🔗 Original error:", (error as any).originalError);
        }
      } else {
        console.error("🤷 Non-standard connectWallet error:", JSON.stringify(error, null, 2));
        errorMessage = "Non-standard error occurred";
        errorDetails = { rawError: error };
      }

      updateConnectionState({
        isConnecting: false,
        error: errorMessage,
      });

      console.error("📋 Final error state:", { errorMessage, errorDetails });
      return false;
    } finally {
      connectionAttemptRef.current = false;
      console.log("🏁 Connection attempt completed, flags reset");
    }
  }, [
    authUser,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
    dataWeb3Auth?.isConnected,
    getWalletToken,
    connectToWeb3Auth,
    updateConnectionState,
  ]);

  // Reconnect function for manual retries
  const reconnect = useCallback(async () => {
    await connectWallet();
  }, [connectWallet]);

  // Setup auto-reconnect interval with detailed logging
  const setupReconnectInterval = useCallback(() => {
    // Clear existing interval
    if (reconnectIntervalRef.current) {
      console.log("Clearing existing reconnect interval");
      clearInterval(reconnectIntervalRef.current);
      reconnectIntervalRef.current = null;
    }

    // Only setup if we have user but no wallet address and not currently connecting
    const shouldSetupInterval = authUser && !account.address && !connectionState.isConnecting;

    console.log("Reconnect interval setup check:", {
      hasAuthUser: !!authUser,
      hasWalletAddress: !!account.address,
      isConnecting: connectionState.isConnecting,
      shouldSetup: shouldSetupInterval,
      web3AuthConnected: dataWeb3Auth?.isConnected,
      web3AuthInitialized: dataWeb3Auth?.isInitialized,
    });

    if (shouldSetupInterval) {
      console.log("Setting up auto-reconnect interval (every 2 seconds)");

      let attemptCount = 0;

      reconnectIntervalRef.current = window.setInterval(async () => {
        attemptCount++;
        console.log(`🔄 Auto-reconnect attempt #${attemptCount}`);

        // Log current state before each attempt
        console.log(`State before attempt #${attemptCount}:`, {
          hasAuthUser: !!authUser,
          hasToken: !!localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN),
          tokenExpired: isTokenExpired(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)),
          walletAddress: account.address,
          web3AuthStatus: {
            isInitialized: dataWeb3Auth?.isInitialized,
            isInitializing: dataWeb3Auth?.isInitializing,
            isConnected: dataWeb3Auth?.isConnected,
          },
          connectionState,
        });

        const success = await connectWallet();

        if (success) {
          console.log(`✅ Auto-reconnect successful after ${attemptCount} attempts`);
          clearInterval(reconnectIntervalRef.current!);
          reconnectIntervalRef.current = null;
        } else {
          console.log(
            `❌ Auto-reconnect attempt #${attemptCount} failed, will retry in 2 seconds...`
          );
          console.log("💡 Current error state:", connectionState.error);
        }
      }, 2000); // Try every 2 seconds
    }
  }, [
    authUser,
    account.address,
    connectionState.isConnecting,
    connectionState,
    dataWeb3Auth?.isConnected,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    connectWallet,
  ]);

  // Link wallet address with error handling
  const linkWalletAddress = useCallback(
    async (address: string) => {
      if (!authUser) return;

      try {
        console.log(`🔗 Linking wallet address: ${address}`);
        await trpcClient.wallet.linkWalletAddress.mutate({ address });
        console.log("✅ Wallet address linked successfully");
      } catch (error) {
        console.error("❌ Failed to link wallet address:", error);

        // Log detailed linking error
        if (error instanceof Error) {
          console.error("🔍 Wallet linking error details:", {
            message: error.message,
            name: error.name,
            code: (error as any).code,
            status: (error as any).status,
            address: address,
          });

          // Log tRPC specific details if available
          if ((error as any).data) {
            console.error("🔧 tRPC linking error data:", (error as any).data);
          }
        }
      }
    },
    [authUser]
  );

  // Effects

  // Initial connection attempt when user logs in or Web3Auth becomes ready
  useEffect(() => {
    console.log("🔍 Initial connection effect triggered:", {
      hasAuthUser: !!authUser,
      web3AuthInitialized: dataWeb3Auth?.isInitialized,
      web3AuthInitializing: dataWeb3Auth?.isInitializing,
    });

    if (authUser && dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing) {
      console.log("🚀 Triggering initial wallet connection");
      connectWallet();
    }
  }, [authUser, dataWeb3Auth?.isInitialized, dataWeb3Auth?.isInitializing, connectWallet]);

  // Setup reconnect interval with cleanup
  useEffect(() => {
    setupReconnectInterval();

    return () => {
      console.log("🧹 Cleaning up reconnect interval");
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
    };
  }, [setupReconnectInterval]);

  // Link wallet address when available
  useEffect(() => {
    if (account.address && authUser) {
      console.log(`🔗 Linking wallet address: ${account.address}`);
      linkWalletAddress(account.address);
    }
  }, [account.address, authUser, linkWalletAddress]);

  // Update connection status based on Web3Auth and account state
  useEffect(() => {
    const newIsConnected = dataWeb3Auth?.isConnected && account.address;
    const fallbackConnected =
      dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing && !!account.address;

    console.log("📊 Connection status update:", {
      web3AuthConnected: dataWeb3Auth?.isConnected,
      hasWalletAddress: !!account.address,
      web3AuthInitialized: dataWeb3Auth?.isInitialized,
      web3AuthInitializing: dataWeb3Auth?.isInitializing,
      newIsConnected,
      fallbackConnected,
    });

    if (newIsConnected) {
      updateConnectionState({ isConnected: true });
    } else if (dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing) {
      updateConnectionState({ isConnected: fallbackConnected });
    }
  }, [
    dataWeb3Auth?.isConnected,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    account.address,
    updateConnectionState,
  ]);

  // Disconnect when user logs out
  useEffect(() => {
    if (!authUser && connectionState.isConnected) {
      console.log("👋 User logged out, disconnecting wallet");
      safeDisconnect();
    }
  }, [authUser, connectionState.isConnected, safeDisconnect]);

  // Context value
  const contextValue: WalletContextType = {
    connectionState,
    reconnect,
  };

  return <WalletContext.Provider value={contextValue}>{children}</WalletContext.Provider>;
};

// Hook to use wallet context (optional - você pode não exportar se não quiser expor)
export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
