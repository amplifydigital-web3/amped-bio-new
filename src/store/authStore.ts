import { create } from 'zustand';
import { login, registerNewUser } from '../api';
import type { AuthUser } from '../types/auth';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (name: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  token: null,

  signIn: async (email: string, password: string) => {
    let authed_user = { email: '', id: '', token: '' };
    try {
      set({ loading: true, error: null });
      const { user, token } = await login({ email, password });
      set({ user: { ...user, token } });
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
    let authed_user = { email: '', id: '', token: '' };
    try {
      set({ loading: true, error: null });
      const { user, token } = await registerNewUser({ onelink, email, password });
      set({ user: { ...user, token } });
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
      set({ loading: true, error: null, user: null, token: null });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));

// // Set up auth state listener
// onAuthStateChanged(auth, (user) => {
//   useAuthStore.setState({ user, loading: false });
// });