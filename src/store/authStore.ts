import { create } from "zustand";
import { persist, PersistOptions } from "zustand/middleware";
import { login, registerNewUser, passwordResetRequest } from "../api/api";
import type { AuthUser } from "../types/auth";
import { defaultAuthUser } from "./defaults";

type AuthState = {
  authUser: AuthUser;
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (onelink: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string>;
};

type AuthPersistOptions = PersistOptions<AuthState>;

const persistOptions: AuthPersistOptions = {
  name: "auth-storage",
};

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      authUser: defaultAuthUser,
      loading: false,
      error: null,
      token: null,

      signIn: async (email: string, password: string) => {
        let authed_user = { email: "", id: 0, onelink: "", emailVerified: false };
        try {
          set({ loading: true, error: null });
          const { user, token } = await login({ email, password });
          // Save token to localStorage for axios to use
          localStorage.setItem("amped-bio-auth-token", token);
          set({ authUser: { ...user, token }, token });
          authed_user = user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ loading: false });
        }

        return authed_user;
      },

      signUp: async (onelink: string, email: string, password: string) => {
        let authed_user = { email: "", id: 0, onelink: "", token: "", emailVerified: false };
        try {
          set({ loading: true, error: null });
          const { user, token } = await registerNewUser({ onelink, email, password });
          // Save token to localStorage for axios to use
          localStorage.setItem("auth-token", token);
          set({ authUser: { ...user, token }, token });
          authed_user = user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ loading: false });
        }
        return authed_user;
      },

      signOut: async () => {
        try {
          set({ loading: true, error: null, authUser: defaultAuthUser, token: null });
          // Remove token from localStorage when signing out
          localStorage.removeItem("auth-token");
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },
      resetPassword: async (email: string) => {
        try {
          const res = await passwordResetRequest(email);
          return res.message;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ loading: false });
        }
      },
    }),
    persistOptions
  )
);

// // Set up auth state listener
// onAuthStateChanged(auth, (user) => {
//   useAuthStore.setState({ user, loading: false });
// });
