import { create } from "zustand";
import { persist, PersistOptions } from "zustand/middleware";
import type { AuthUser } from "../types/auth";
import { trpc } from "../utils/trpc";

type AuthState = {
  authUser: AuthUser | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (onelink: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateAuthUser: (userData: Partial<AuthUser>) => void;
};

type AuthPersistOptions = PersistOptions<AuthState>;

const persistOptions: AuthPersistOptions = {
  name: "auth-storage",
};

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      authUser: null,
      error: null,

      signIn: async (email: string, password: string) => {
        try {
          set({ error: null });
          const response = await trpc.auth.login.mutate({ email, password });
          
          if (!response.success) {
            throw new Error("Login failed");
          }
          
          // Save token to localStorage for tRPC to use
          localStorage.setItem("amped-bio-auth-token", response.token);
          set({ authUser: response.user });

          return response.user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      signUp: async (onelink: string, email: string, password: string) => {
        try {
          set({ error: null });
          const response = await trpc.auth.register.mutate({ onelink, email, password });
          
          if (!response.success) {
            throw new Error("Registration failed");
          }
          
          // Save token to localStorage for tRPC to use
          localStorage.setItem("amped-bio-auth-token", response.token);
          set({ authUser: response.user });
          return response.user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      signOut: async () => {
        try {
          set({ error: null, authUser: null });
          // Remove token from localStorage when signing out
          localStorage.removeItem("amped-bio-auth-token");
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },
      
      resetPassword: async (email: string) => {
        try {
          const response = await trpc.auth.passwordResetRequest.mutate({ email });
          // The response will be sent back to the AuthModal component
          // to handle both success and error cases
          return response;
        } catch (error) {
          set({ error: (error as Error).message });
          // Return error object instead of throwing so the modal can show it
          return {
            success: false,
            message: (error as Error).message || "Password reset request failed"
          };
        }
      },

      updateAuthUser: (userData: Partial<AuthUser>) => {
        set(state => ({
          authUser: state.authUser ? { ...state.authUser, ...userData } : null,
        }));
      },
    }),
    persistOptions
  )
);
