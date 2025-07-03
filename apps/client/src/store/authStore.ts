import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "../types/auth";
import { trpcClient } from "../utils/trpc";

// Helper function to check JWT token validity
const isTokenValid = (): boolean => {
  try {
    const token = localStorage.getItem("amped-bio-auth-token");
    if (!token) return false;
    
    // JWT structure: header.payload.signature
    const payload = token.split('.')[1];
    if (!payload) return false;
    
    // Decode base64
    const decodedPayload = JSON.parse(atob(payload));
    
    // Check if token has expiration and is still valid
    if (decodedPayload && decodedPayload.exp) {
      // exp is in seconds, Date.now() is in milliseconds
      return decodedPayload.exp * 1000 > Date.now();
    }
    
    return false;
  } catch (error) {
    console.error("Error validating token:", error);
    return false;
  }
};

type AuthState = {
  authUser: AuthUser | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (onelink: string, email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  updateAuthUser: (userData: Partial<AuthUser>) => void;
  setAuthToken: (token: string | null) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      authUser: null,
      error: null,

      setAuthToken: (token: string | null): void => {
        if (token) {
          localStorage.setItem("amped-bio-auth-token", token);
        } else {
          localStorage.removeItem("amped-bio-auth-token");
        }
      },

      signIn: async (email: string, password: string) => {
        try {
          set({ error: null });
          const response = await trpcClient.auth.login.mutate({ email, password });
  
          // Use store function to set token
          useAuthStore.getState().setAuthToken(response.accessToken);
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
          const response = await trpcClient.auth.register.mutate({ onelink, email, password });

          // Use store function to set token
          useAuthStore.getState().setAuthToken(response.accessToken);
          set({ authUser: response.user });
          return response.user;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },

      signOut: async () => {
        set({ error: null, authUser: null });
        // Use store function to remove token
        useAuthStore.getState().setAuthToken(null);
      },
      
      resetPassword: async (email: string) => {
        try {
          const response = await trpcClient.auth.passwordResetRequest.mutate({ email });
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
    {
      name: "auth-storage",
      onRehydrateStorage: () => {
        // This function runs before rehydration
        return (restoredState, error) => {
          // This callback runs after rehydration
          if (error) {
            console.error("Error rehydrating auth state:", error);
          } else if (restoredState) {
            // Check if token is valid
            const tokenValid = isTokenValid();
            
            console.log("Auth state loaded from storage:", {
              isAuthenticated: !!restoredState.authUser && tokenValid,
              user: restoredState.authUser,
              tokenValid
            });
            
            // If token is invalid but we have a user in state, clear the auth state
            if (!tokenValid && restoredState.authUser) {
              console.warn("JWT token expired, signing out user");
              
              restoredState.signOut();
            }
          }
        };
      }
    }
  )
);
