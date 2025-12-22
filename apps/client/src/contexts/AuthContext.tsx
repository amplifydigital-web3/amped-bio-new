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

  const signIn = async (email: string, password: string, _recaptchaToken: string | null) => {
    try {
      setError(null);
      const response = await authClient.signIn.email({
        email,
        password,
      });
      if (response.data?.user) {
        const user = response.data.user as BetterAuthUser;
        const mappedUser: AuthUser = {
          id: parseInt(user.id),
          email: user.email,
          onelink: user.onelink || user.name || user.email?.split("@")[0] || "",
          role: user.role || "user",
          image: user.image || null,
          wallet: null,
        };
        setAuthUser(mappedUser);
        return mappedUser;
      } else {
        throw new Error("Login failed");
      }
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const signUp = async (
    onelink: string,
    email: string,
    password: string,
    _recaptchaToken: string | null
  ) => {
    try {
      setError(null);
      const response = await authClient.signUp.email({
        email,
        password,
        name: onelink,
      });
      if (response.data?.user) {
        const user = response.data.user as BetterAuthUser;
        const mappedUser: AuthUser = {
          id: parseInt(user.id),
          email: user.email,
          onelink: onelink,
          role: user.role || "user",
          image: user.image || null,
          wallet: null,
        };
        setAuthUser(mappedUser);
        return mappedUser;
      } else {
        throw new Error("Sign up failed");
      }
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  };

  const resetPassword = async (email: string, _recaptchaToken: string | null) => {
    try {
      // Use forgotPassword method for password reset request
      const response = await (authClient as any).forgotPassword({
        email,
        redirectTo: "/auth/reset-password",
      });
      if (response.error) {
        return {
          success: false,
          message: response.error.message || "Password reset request failed",
        };
      }
      return {
        success: true,
        message: "Password reset email sent",
      };
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

  const signInWithGoogle = async (_token: string) => {
    try {
      setError(null);
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (response.data && !response.error) {
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
          return mappedUser;
        }
      }
      throw new Error("Google sign in failed");
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
