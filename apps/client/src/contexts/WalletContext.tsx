import { createContext, useState, useEffect, ReactNode, useCallback, useRef } from "react";
import { useWeb3AuthDisconnect, useWeb3AuthConnect, useWeb3Auth } from "@web3auth/modal/react";
import { WALLET_CONNECTORS, AUTH_CONNECTION } from "@web3auth/modal";
import { useAccount } from "wagmi";
import { trpcClient } from "../utils/trpc";
import { AUTH_STORAGE_KEYS } from "../constants/auth-storage";
import { useAuth } from "./AuthContext";

// Define detailed result type for connection attempts
type ConnectionResult = {
  success: boolean;
  reason?: string;
  details?: Record<string, any>;
};

// Helper function to check if token is expired or invalid
// Returns true if the token is expired, has no expiration date, or is invalid
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;

  try {
    // Split the JWT into header, payload, signature
    const parts = token.split(".");
    if (parts.length !== 3) return true;

    // Convert base64url to base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    // Use Buffer to decode
    const jsonStr = Buffer.from(paddedBase64, "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);

    if (!payload || !payload.exp) return true;

    const expirationTime = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();

    return now >= expirationTime;
  } catch (error) {
    console.error("Error checking token expiration:", error);
    return true;
  }
};

// Internal context definition to manage wallet state
// Since we don't export a hook, we can use a minimal context
const WalletContext = createContext<unknown>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  // Get authUser directly from AuthContext
  const { authUser } = useAuth();
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();
  const { connectTo } = useWeb3AuthConnect();
  const dataWeb3Auth = useWeb3Auth();
  const account = useAccount();

  // Use a ref to track connection attempts and prevent parallel execution
  const connectionAttemptRef = useRef(false);
  const connectionIntervalRef = useRef<number | null>(null);

  // Helper function to safely disconnect Web3Auth
  const safeDisconnect = useCallback(async () => {
    try {
      await web3AuthDisconnect({ cleanup: true });
      setIsConnected(false);
    } catch (error) {
      console.warn("Web3Auth disconnect failed:", error);
    }
  }, [web3AuthDisconnect]);

  // Helper function to connect to Web3Auth with JWT token
  const connectToWallet = useCallback(async () => {
    try {
      const status = dataWeb3Auth?.web3Auth?.status;
      // Wait for Web3Auth to be initialized
      if (
        !dataWeb3Auth?.isInitialized ||
        dataWeb3Auth?.isInitializing ||
        !dataWeb3Auth?.web3Auth ||
        status === "not_ready"
      ) {
        console.log("Web3Auth not initialized yet, will try to connect later", status);
        return false; // Return false to indicate connection was not successful
      }

      console.log("Getting wallet token from backend");
      let walletToken;
      try {
        const walletTokenResponse = await trpcClient.auth.getWalletToken.query();
        walletToken = walletTokenResponse.walletToken;
      } catch (tokenError) {
        console.error("Failed to get wallet token from backend:", tokenError);

        // Log detailed error information
        if (tokenError instanceof Error) {
          console.error("Wallet token error details:", {
            message: tokenError.message,
            name: tokenError.name,
            stack: tokenError.stack,
            code: (tokenError as any).code,
            type: (tokenError as any).type,
            status: (tokenError as any).status,
            statusText: (tokenError as any).statusText,
          });

          // Log response data if available
          if ((tokenError as any).response) {
            console.error("Wallet token error response:", {
              status: (tokenError as any).response.status,
              data: (tokenError as any).response.data,
              headers: (tokenError as any).response.headers,
            });
          }

          // Log request data if available
          if ((tokenError as any).request) {
            console.error("Wallet token error request:", {
              url: (tokenError as any).request.url,
              method: (tokenError as any).request.method,
              headers: (tokenError as any).request.headers,
            });
          }
        } else {
          // If it's not an Error instance, log the entire object
          console.error("Wallet token non-standard error:", JSON.stringify(tokenError, null, 2));
        }

        return false; // Return false to indicate connection was not successful
      }

      if (!walletToken) {
        console.error("Failed to get wallet token from backend");
        return false; // Return false to indicate connection was not successful
      }

      console.log("Connecting to Web3Auth with token");
      try {
        await connectTo(WALLET_CONNECTORS.AUTH, {
          authConnection: AUTH_CONNECTION.CUSTOM,
          authConnectionId: import.meta.env.VITE_WEB3AUTH_AUTH_CONNECTION_ID,
          idToken: walletToken,
          extraLoginOptions: {
            isUserIdCaseSensitive: false,
          },
        });
        console.log("Connected to Web3Auth successfully");
        setIsConnected(true);
        return true; // Return true to indicate connection was successful
      } catch (connectError) {
        console.error("Failed to connect to Web3Auth:", connectError);
        if (connectError instanceof Error) {
          console.error("Web3Auth connection error details:", {
            message: connectError.message,
            stack: connectError.stack,
            name: connectError.name,
            code: (connectError as any).code,
            type: (connectError as any).type,
            reason: (connectError as any).reason,
          });

          // Log additional info if it's a specific type of error
          if ((connectError as any).info) {
            console.error("Web3Auth error additional info:", (connectError as any).info);
          }

          if ((connectError as any).data) {
            console.error("Web3Auth error data:", (connectError as any).data);
          }
        } else {
          // If it's not an Error instance, log the entire object
          console.error(
            "Web3Auth non-standard error object:",
            JSON.stringify(connectError, null, 2)
          );
        }
        return false; // Return false to indicate connection was not successful
      }
    } catch (error) {
      console.error("Unexpected error in connectToWallet:", error);

      if (error instanceof Error) {
        console.error("connectToWallet main error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: (error as any).code,
          type: (error as any).type,
          status: (error as any).status,
          statusText: (error as any).statusText,
        });

        // Log any additional properties that might contain useful debugging info
        const errorObj = error as any;
        const additionalInfo: Record<string, any> = {};

        // Collect non-standard properties that might contain useful info
        Object.keys(errorObj).forEach(key => {
          if (!["message", "name", "stack"].includes(key)) {
            try {
              additionalInfo[key] = errorObj[key];
            } catch (e) {
              additionalInfo[key] = "[Error accessing property]";
            }
          }
        });

        if (Object.keys(additionalInfo).length > 0) {
          console.error("connectToWallet additional error properties:", additionalInfo);
        }
      } else {
        // If it's not an Error instance, log the entire object
        console.error("connectToWallet non-standard error:", JSON.stringify(error, null, 2));
      }

      return false; // Return false to indicate connection was not successful
    }
  }, [
    connectTo,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
  ]);

  // Function to attempt wallet connection with detailed diagnostics
  const connectIfReady = useCallback(async (): Promise<ConnectionResult> => {
    const jwtToken = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);

    // Prevent parallel execution
    if (connectionAttemptRef.current) {
      console.log("Connection attempt prevented - another attempt is already in progress");
      return {
        success: false,
        reason: "PARALLEL_EXECUTION_PREVENTED",
        details: { message: "Another connection attempt is already in progress" },
      };
    }

    connectionAttemptRef.current = true;
    setIsConnecting(true);

    // Safety timeout to reset the flag after 30 seconds in case of unhandled errors
    const safetyTimeout = setTimeout(() => {
      if (connectionAttemptRef.current) {
        console.warn("Connection attempt flag reset by safety timeout after 30 seconds");
        connectionAttemptRef.current = false;
        setIsConnecting(false);
      }
    }, 30000);

    try {
      // Only proceed if we have a token
      if (!jwtToken) {
        console.log("No token available, skipping wallet connection");
        return {
          success: false,
          reason: "NO_TOKEN",
          details: { message: "No JWT token available" },
        };
      }

      // Check if token is not expired
      if (isTokenExpired(jwtToken)) {
        console.log("Token is expired, waiting for token refresh before wallet connection");
        return {
          success: false,
          reason: "TOKEN_EXPIRED",
          details: { message: "JWT token is expired" },
        };
      }

      // Only attempt to connect if Web3Auth is initialized
      if (dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing && dataWeb3Auth?.web3Auth) {
        // Check if wallet is already connected
        if (dataWeb3Auth?.isConnected) {
          console.log("Wallet is already connected, skipping connection");
          setIsConnected(true);
          return {
            success: true,
            reason: "ALREADY_CONNECTED",
            details: { message: "Wallet is already connected" },
          };
        }

        console.log("Token and Web3Auth are ready, connecting to wallet");
        const connected = await connectToWallet();

        if (connected) {
          return {
            success: true,
            reason: "CONNECTION_SUCCESSFUL",
            details: { message: "Successfully connected to wallet" },
          };
        } else {
          return {
            success: false,
            reason: "CONNECTION_FAILED",
            details: {
              message: "Failed to connect to wallet via connectToWallet()",
              web3AuthStatus: {
                isInitialized: dataWeb3Auth?.isInitialized,
                isInitializing: dataWeb3Auth?.isInitializing,
                isConnected: dataWeb3Auth?.isConnected,
              },
            },
          };
        }
      } else {
        console.log("Web3Auth not initialized yet, skipping wallet connection");
        return {
          success: false,
          reason: "WEB3AUTH_NOT_READY",
          details: {
            message: "Web3Auth is not fully initialized",
            web3AuthStatus: {
              isInitialized: dataWeb3Auth?.isInitialized,
              isInitializing: dataWeb3Auth?.isInitializing,
              hasWeb3Auth: !!dataWeb3Auth?.web3Auth,
            },
          },
        };
      }
    } catch (error) {
      console.error("Unexpected error in connectIfReady:", error);

      // Collect detailed error info
      const errorDetails: Record<string, any> = {};

      if (error instanceof Error) {
        errorDetails.message = error.message;
        errorDetails.name = error.name;
        errorDetails.stack = error.stack;
        errorDetails.code = (error as any).code;
        errorDetails.type = (error as any).type;

        console.error("connectIfReady error details:", errorDetails);

        // Additional properties that might be present
        if ((error as any).info) {
          errorDetails.additionalInfo = (error as any).info;
          console.error("connectIfReady error additional info:", (error as any).info);
        }

        if ((error as any).data) {
          errorDetails.data = (error as any).data;
          console.error("connectIfReady error data:", (error as any).data);
        }
      } else {
        // If it's not an Error instance, log the entire object
        errorDetails.rawError = JSON.stringify(error, null, 2);
        console.error("connectIfReady non-standard error object:", errorDetails.rawError);
      }

      return {
        success: false,
        reason: "UNEXPECTED_ERROR",
        details: {
          message: "An unexpected error occurred during connection attempt",
          errorDetails,
          web3AuthStatus: {
            isInitialized: dataWeb3Auth?.isInitialized,
            isInitializing: dataWeb3Auth?.isInitializing,
            isConnected: dataWeb3Auth?.isConnected,
            hasWeb3Auth: !!dataWeb3Auth?.web3Auth,
          },
        },
      };
    } finally {
      // Clear safety timeout
      clearTimeout(safetyTimeout);

      // Always reset the flags when done
      connectionAttemptRef.current = false;
      setIsConnecting(false);

      console.log("Connection attempt completed, flags reset");
    }
  }, [
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
    dataWeb3Auth?.isConnected,
    connectToWallet,
  ]);

  // Effect to connect to wallet when token changes or Web3Auth becomes ready
  useEffect(() => {
    // Initial connection attempt if authenticated
    if (authUser) {
      connectIfReady();
    }
  }, [
    authUser,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
    dataWeb3Auth?.isConnected,
    connectIfReady,
  ]);

  // Effect to periodically try to connect wallet if we have a user but no account
  useEffect(() => {
    // Clear any existing interval
    if (connectionIntervalRef.current) {
      window.clearInterval(connectionIntervalRef.current);
      connectionIntervalRef.current = null;
    }

    // Only start interval if we have a user but no wallet address
    if (authUser && !account.address) {
      console.log("Setting up periodic wallet connection check");

      // Use a counter to track consecutive failures for debugging
      let attempts = 0;

      connectionIntervalRef.current = window.setInterval(async () => {
        attempts++;
        console.log(`Periodic wallet connection attempt #${attempts}`);

        // Log detailed Web3Auth status before each attempt
        console.log(`Web3Auth current state (#${attempts}):`, {
          isInitialized: dataWeb3Auth?.isInitialized,
          isInitializing: dataWeb3Auth?.isInitializing,
          isConnected: dataWeb3Auth?.isConnected,
          hasWeb3Auth: !!dataWeb3Auth?.web3Auth,
          hasToken: !!localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN),
          tokenExpired: isTokenExpired(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)),
          hasAuthUser: !!authUser,
          hasWalletAddress: !!account.address,
          chainId: account.chainId,
          walletStatus: account.status,
          walletIsConnecting: account.isConnecting,
          walletIsDisconnected: account.isDisconnected,
          walletIsReconnecting: account.isReconnecting,
        });

        try {
          const result = await connectIfReady();
          if (result.success) {
            console.log("Wallet connection successful, clearing interval");
            console.log(`Success details (#${attempts}):`, {
              reason: result.reason,
              details: result.details,
            });
            // We could clear the interval here, but we'll let the effect's dependency handle it
            // when account.address becomes available
          } else {
            // Log detailed diagnostic information about why connection failed
            console.log(
              `Wallet connection attempt #${attempts} failed (${result.reason}), will try again in 1 second.`
            );
            console.log(`Failure details (#${attempts}):`, {
              reason: result.reason,
              details: result.details,
              web3AuthState: {
                isInitialized: dataWeb3Auth?.isInitialized,
                isInitializing: dataWeb3Auth?.isInitializing,
                isConnected: dataWeb3Auth?.isConnected,
                hasWeb3Auth: !!dataWeb3Auth?.web3Auth,
              },
              accountState: {
                address: account.address,
                chainId: account.chainId,
                status: account.status,
                isConnecting: account.isConnecting,
                isDisconnected: account.isDisconnected,
                isReconnecting: account.isReconnecting,
              },
              tokenState: {
                hasToken: !!localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN),
                tokenExpired: isTokenExpired(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)),
              },
            });
          }
        } catch (error) {
          // This is an extra safety net that shouldn't be needed due to try/catch in connectIfReady
          console.error(`Unexpected error in periodic connection attempt #${attempts}:`, error);

          // Log detailed error information
          if (error instanceof Error) {
            console.error(`Periodic connection attempt #${attempts} error details:`, {
              message: error.message,
              name: error.name,
              stack: error.stack,
              code: (error as any).code,
              type: (error as any).type,
            });

            // Additional properties that might be present
            if ((error as any).info) {
              console.error(
                `Periodic connection attempt #${attempts} error info:`,
                (error as any).info
              );
            }

            if ((error as any).data) {
              console.error(
                `Periodic connection attempt #${attempts} error data:`,
                (error as any).data
              );
            }
          } else {
            // If it's not an Error instance, log the entire object
            console.error(
              `Periodic connection attempt #${attempts} non-standard error:`,
              JSON.stringify(error, null, 2)
            );
          }

          // We intentionally don't clear the interval here to keep trying
        }
      }, 2000); // Try every 2 seconds
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (connectionIntervalRef.current) {
        window.clearInterval(connectionIntervalRef.current);
        connectionIntervalRef.current = null;
      }
    };
  }, [
    // Essentials for connection check triggering
    authUser,
    account.address,
    connectIfReady,
    // Additional connection status dependencies for diagnostics only
    account.chainId,
    account.status,
    account.isConnecting,
    account.isDisconnected,
    account.isReconnecting,
    dataWeb3Auth?.isConnected,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    dataWeb3Auth?.web3Auth,
  ]);

  // Effect to link wallet address when it becomes available
  useEffect(() => {
    if (account.address && authUser) {
      trpcClient.wallet.linkWalletAddress.mutate({ address: account.address }).catch(error => {
        console.error("Failed to link wallet address:", error);
      });
    }
  }, [account.address, authUser]);

  // Effect to update connection status based on Web3Auth state
  useEffect(() => {
    if (dataWeb3Auth?.isConnected) {
      setIsConnected(true);
    } else if (dataWeb3Auth?.isInitialized && !dataWeb3Auth?.isInitializing) {
      setIsConnected(!!account.address);
    }
  }, [
    dataWeb3Auth?.isConnected,
    dataWeb3Auth?.isInitialized,
    dataWeb3Auth?.isInitializing,
    account.address,
  ]);

  // Disconnect wallet when authUser is removed
  useEffect(() => {
    if (!authUser && isConnected) {
      safeDisconnect();
    }
  }, [authUser, isConnected, safeDisconnect]);

  // The WalletProvider is only responsible for automatically connecting the wallet
  return <WalletContext.Provider value={{}}>{children}</WalletContext.Provider>;
};
