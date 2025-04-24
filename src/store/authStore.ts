import { create } from "zustand";
import { persist, PersistOptions } from "zustand/middleware";
import { login, registerNewUser, passwordResetRequest } from "../api/api";
import type { AuthUser } from "../types/auth";

type AuthState = {
  authUser: AuthUser | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (onelink: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string>;
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
      token: null,

      signIn: async (email: string, password: string) => {
        try {
          set({ error: null });
          const { user, token } = await login({ email, password });
          // Save token to localStorage for axios to use
          localStorage.setItem("amped-bio-auth-token", token);
          set({ authUser: user });

          return user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      signUp: async (onelink: string, email: string, password: string) => {
        try {
          set({ error: null });
          const { user, token } = await registerNewUser({ onelink, email, password });
          // Save token to localStorage for axios to use
          localStorage.setItem("amped-bio-auth-token", token);
          set({ authUser: { ...user } });
          return user;
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
          const res = await passwordResetRequest(email);
          return res.message;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
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
