import { httpBatchLink } from "@trpc/client";
import { withRelatedProject } from "@vercel/related-projects";
import { ERROR_CAUSES } from "@ampedbio/constants";
import { AUTH_EVENTS } from "../../../constants/auth-events";
import { AUTH_STORAGE_KEYS } from "../../../constants/auth-storage";

// Base URL for API calls
const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

/**
 * Refreshes the access token using the refresh token via tRPC
 * Includes retry mechanisms and improved error handling
 */
async function refreshToken(): Promise<string | null> {
  // Implement a lock to prevent multiple simultaneous refresh calls
  if ((globalThis as any).__refreshingToken) {
    console.log("Token refresh already in progress, waiting...");
    try {
      // Wait for the current operation to finish (max 10 seconds)
      await new Promise<void>(resolve => {
        const checkRefreshStatus = () => {
          if (!(globalThis as any).__refreshingToken) {
            resolve();
          } else {
            setTimeout(checkRefreshStatus, 100);
          }
        };

        // Timeout after 10 seconds to avoid infinite wait
        const timeout = setTimeout(() => {
          console.warn("Refresh token wait timed out");
          resolve();
        }, 10000);

        checkRefreshStatus();

        // Clear timeout if resolve happens before
        return () => clearTimeout(timeout);
      });

      // Return the token that should already be updated in localStorage
      const cachedToken = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
      if (cachedToken) {
        return cachedToken;
      }
    } catch (error) {
      console.error("Error waiting for token refresh:", error);
    }
  }

  // Set flag to indicate that refresh is in progress
  (globalThis as any).__refreshingToken = true;

  try {
    console.log("Starting token refresh...");
    const response = await globalThis.fetch(
      `${import.meta.env.VITE_API_URL ?? baseURL}/trpc/auth.refreshToken`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for refresh token
      }
    );

    if (!response.ok) {
      console.error("Token refresh response not OK:", response.status, response.statusText);
      throw new Error(`Failed to refresh token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const newToken = data.result?.data?.accessToken;

    if (newToken) {
      console.log("Token refresh successful, storing new token");
      localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, newToken);
      // Dispatch token refreshed event
      window.dispatchEvent(
        new CustomEvent(AUTH_EVENTS.TOKEN_REFRESHED, { detail: { token: newToken } })
      );
      return newToken;
    } else {
      console.error("Token refresh response did not contain a new token:", data);
      throw new Error("Token refresh response did not contain a new token");
    }
  } catch (error) {
    console.error("Token refresh failed:", error);
    // Clear tokens if refresh fails
    localStorage.removeItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);

    // Always dispatch token expired event when failing to obtain a new token
    console.log("Token refresh failed, re-authentication required");
    // Dispatch token expired event for any refresh failure
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.TOKEN_EXPIRED));

    // Don't clear refresh token cookie as it's handled by the server
    return null;
  } finally {
    // Release the lock
    (globalThis as any).__refreshingToken = false;
  }
}

/**
 * Creates an HTTP batch link for TRPC that connects to the backend API.
 * Automatically adds authorization headers and handles token refresh on expiration.
 */
export const createHttpLink = () => {
  return httpBatchLink({
    url: `${import.meta.env.VITE_API_URL ?? baseURL}/trpc`,
    headers() {
      const token = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);
      return token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {};
    },
    async fetch(url, options) {
      // Ensure credentials are always included
      const fetchOptions = {
        ...(options as RequestInit),
        credentials: "include" as RequestCredentials,
      };

      // Helper function to check if the error is due to expired token
      const isTokenExpiredError = async (response: Response) => {
        try {
          const errorData = await response.clone().json();
          return (
            errorData.some?.(
              (error: any) => error.error?.data?.cause === ERROR_CAUSES.TOKEN_EXPIRED
            ) ||
            errorData.error?.data?.cause === ERROR_CAUSES.TOKEN_EXPIRED ||
            // Additional checks for other error formats that may indicate expired token
            errorData.message?.toLowerCase().includes("token expired") ||
            errorData.error?.message?.toLowerCase().includes("token expired")
          );
        } catch (error) {
          console.warn("Failed to parse error response:", error);
          return false;
        }
      };

      // First attempt with current token
      let response = await globalThis.fetch(url, fetchOptions);

      // If the first request fails, check if it's due to token expiration
      if (!response.ok) {
        const tokenExpired = await isTokenExpiredError(response);

        if (tokenExpired) {
          console.log("Token expired, attempting to refresh...");

          // Try to refresh the token
          const newToken = await refreshToken();

          if (newToken) {
            // Create new options with the updated token
            const newOptions = {
              ...(options as RequestInit),
              credentials: "include" as RequestCredentials,
              headers: {
                ...(options as RequestInit)?.headers,
                Authorization: `Bearer ${newToken}`,
              },
            };

            // Retry the request with the new token
            response = await globalThis.fetch(url, newOptions);
            console.log("Request retried with new token");

            // If it still fails even with the updated token, check if it's a token issue again
            if (!response.ok && (await isTokenExpiredError(response))) {
              console.error("Request failed even after token refresh");
              // Possibly a problem with the refresh token as well, logout necessary
              window.dispatchEvent(new CustomEvent(AUTH_EVENTS.TOKEN_EXPIRED));
            }
          } else {
            // Refresh failed, always treat as an expired token regardless of reason
            console.error("Token refresh failed during request, treating as token expired");
            // Dispatch token expired event for any refresh failure
            window.dispatchEvent(new CustomEvent(AUTH_EVENTS.TOKEN_EXPIRED));
          }
        }
      }

      return response;
    },
  });
};
