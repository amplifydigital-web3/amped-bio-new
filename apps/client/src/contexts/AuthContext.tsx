import { createContext, useContext, ReactNode, useCallback, useState, useEffect } from "react";
import type { AuthUser } from "../types/auth";
import { trpcClient } from "../utils/trpc";
import { authClient } from "../lib/auth-client";

// Extended user type for better-auth session
interface BetterAuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  onelink?: string | null;
  role?: string;
}

type AuthContextType = {
  authUser: AuthUser | null;
  error: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string, recaptchaToken: string | null) => Promise<AuthUser>;
  signInWithGoogle: (token: string) => Promise<AuthUser>;
  signUp: (
    onelink: string,
    email: string,
    password: string,
    recaptchaToken: string | null
  ) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (
    email: string,
    recaptchaToken: string | null
  ) => Promise<{ success: boolean; message: string }>;
  updateAuthUser: (userData: Partial<AuthUser>) => void;
  refreshUserData: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        setIsLoading(true);
        const session = await authClient.getSession();
        if (session?.data?.user) {
          const user = session.data.user as BetterAuthUser;
          const mappedUser: AuthUser = {
            id: parseInt(user.id),
            email: user.email,
            onelink: user.onelink || user.name || user.email?.split("@")[0] || "",
            role: user.role || "user",
            image: user.image || null,
            wallet: null,
          };
          setAuthUser(mappedUser);
        }
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  const signIn = async (email: string, password: string, recaptchaToken: string | null) => {
    try {
      setError(null);
      const response = await trpcClient.auth.login.mutate({ email, password, recaptchaToken });
      setAuthUser(response.user);
      return response.user;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const signUp = async (
    onelink: string,
    email: string,
    password: string,
    recaptchaToken: string | null
  ) => {
    try {
      setError(null);
      const response = await trpcClient.auth.register.mutate({
        onelink,
        email,
        password,
        recaptchaToken,
      });
      const authUser: AuthUser = {
        id: response.user.id,
        email: response.user.email,
        onelink: onelink,
        role: "user",
        image: null,
        wallet: null,
      };
      setAuthUser(authUser);
      return authUser;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const resetPassword = async (email: string, recaptchaToken: string | null) => {
    try {
      const response = await trpcClient.auth.passwordResetRequest.mutate({ email, recaptchaToken });
      return response;
    } catch (error) {
      setError((error as Error).message);
      return {
        success: false,
        message: (error as Error).message || "Password reset request failed",
      };
    }
  };

  const _setAuthUser = (user: AuthUser | null) => {
    setAuthUser(user);
  };

  const updateAuthUser = (userData: Partial<AuthUser>) => {
    const newUser = authUser ? { ...authUser, ...userData } : null;
    setAuthUser(newUser);
  };

  const refreshUserData = async () => {
    try {
      const response = await trpcClient.auth.me.query();
      const mappedUser: AuthUser = {
        id: response.user.id,
        email: response.user.email,
        onelink: response.user.onelink ?? "",
        role: response.user.role,
        image: response.user.image,
        wallet: response.user.wallet,
      };
      setAuthUser(mappedUser);
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  const signInWithGoogle = async (token: string) => {
    try {
      setError(null);
      const response = await trpcClient.auth.googleAuth.mutate({ token });
      setAuthUser(response.user);
      return response.user;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const value = {
    authUser,
    error,
    isAuthenticated: !!authUser,
    isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut: async () => {
      try {
        await authClient.signOut();
        setAuthUser(null);
        setError(null);
      } catch (error) {
        setError((error as Error).message);
      }
    },
    resetPassword,
    updateAuthUser,
    refreshUserData,
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
