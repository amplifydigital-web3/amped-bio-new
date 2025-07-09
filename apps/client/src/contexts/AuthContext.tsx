import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import type { AuthUser } from "../types/auth";
import { trpcClient } from "../utils/trpc";
import { useWeb3AuthDisconnect } from "@web3auth/modal/react";

// Helper function to validate token using tRPC "me" method
const validateTokenWithServer = async (): Promise<{ isValid: boolean; user?: AuthUser }> => {
  try {
    const token = localStorage.getItem("amped-bio-auth-token");
    if (!token) return { isValid: false };

    const response = await trpcClient.auth.me.query();

    // Map server response to AuthUser type
    const user: AuthUser = {
      id: response.user.id,
      email: response.user.email,
      onelink: response.user.onelink || "", // Handle null case
      role: response.user.role || "user", // Add role mapping
    };

    return { isValid: true, user };
  } catch (error) {
    console.error("Token validation failed:", error);
    // Clear invalid token from localStorage
    localStorage.removeItem("amped-bio-auth-token");
    return { isValid: false };
  }
};

// Helper function to attempt token refresh
const attemptTokenRefresh = async (): Promise<{ success: boolean; newToken?: string }> => {
  try {
    const response = await trpcClient.auth.refreshToken.mutate();
    return { success: true, newToken: response.accessToken };
  } catch (error) {
    console.error("Token refresh failed:", error);
    return { success: false };
  }
};

type AuthContextType = {
  authUser: AuthUser | null;
  error: string | null;
  isAuthenticated: boolean | null; // null = loading, true = authenticated, false = not authenticated
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (onelink: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateAuthUser: (userData: Partial<AuthUser>) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null); // Start with null (loading)

  const { disconnect: web3AuthDisconnect } = useWeb3AuthDisconnect();

  // Helper function to safely disconnect Web3Auth
  const safeWeb3AuthDisconnect = useCallback(async () => {
    try {
      await web3AuthDisconnect({ cleanup: true });
    } catch (error) {
      console.warn("Web3Auth disconnect failed:", error);
    }
  }, [web3AuthDisconnect]);

  // Helper function to invalidate user session (for token expiry/invalid token)
  const invalidateUserSession = useCallback(async () => {
    console.log("Invalidating user session due to invalid/expired token");
    await safeWeb3AuthDisconnect();
    setAuthUser(null);
    localStorage.removeItem("amped-bio-auth-token");
    localStorage.removeItem("auth-user");
    setIsAuthenticated(false);
  }, [safeWeb3AuthDisconnect]);

  const signOut = useCallback(async () => {
    setError(null);

    // Disconnect Web3Auth
    await safeWeb3AuthDisconnect();

    setAuthUser(null);
    localStorage.removeItem("amped-bio-auth-token");
    localStorage.removeItem("auth-user");
    setIsAuthenticated(false);
  }, [safeWeb3AuthDisconnect]);

  useEffect(() => {
    const validateToken = async () => {
      const { isValid, user } = await validateTokenWithServer();

      if (isValid && user) {
        setAuthUser(user);
        localStorage.setItem("auth-user", JSON.stringify(user));
        setIsAuthenticated(true);
      } else {
        // Token is invalid, try to refresh
        const refreshResult = await attemptTokenRefresh();

        if (refreshResult.success && refreshResult.newToken) {
          // Refresh successful, set new token and validate again
          localStorage.setItem("amped-bio-auth-token", refreshResult.newToken);

          const { isValid: isValidAfterRefresh, user: userAfterRefresh } =
            await validateTokenWithServer();

          if (isValidAfterRefresh && userAfterRefresh) {
            setAuthUser(userAfterRefresh);
            localStorage.setItem("auth-user", JSON.stringify(userAfterRefresh));
            setIsAuthenticated(true);
          } else {
            // Still invalid after refresh, invalidate session and disconnect Web3Auth
            await invalidateUserSession();
          }
        } else {
          // Refresh failed, invalidate session and disconnect Web3Auth
          await invalidateUserSession();
        }
      }
    };

    validateToken();
  }, [invalidateUserSession]);

  const setAuthToken = (token: string | null): void => {
    if (token) {
      localStorage.setItem("amped-bio-auth-token", token);
    } else {
      localStorage.removeItem("amped-bio-auth-token");
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      const response = await trpcClient.auth.login.mutate({ email, password });
      setAuthToken(response.accessToken);
      setAuthUser(response.user);
      localStorage.setItem("auth-user", JSON.stringify(response.user));
      setIsAuthenticated(true);
      return response.user;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const signUp = async (onelink: string, email: string, password: string) => {
    try {
      setError(null);
      const response = await trpcClient.auth.register.mutate({ onelink, email, password });
      setAuthToken(response.accessToken);
      setAuthUser(response.user);
      localStorage.setItem("auth-user", JSON.stringify(response.user));
      setIsAuthenticated(true);
      return response.user;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const response = await trpcClient.auth.passwordResetRequest.mutate({ email });
      return response;
    } catch (error) {
      setError((error as Error).message);
      return {
        success: false,
        message: (error as Error).message || "Password reset request failed",
      };
    }
  };

  const updateAuthUser = (userData: Partial<AuthUser>) => {
    const newUser = authUser ? { ...authUser, ...userData } : null;
    setAuthUser(newUser);
    if (newUser) {
      localStorage.setItem("auth-user", JSON.stringify(newUser));
    }
  };

  const value = {
    authUser,
    error,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateAuthUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
