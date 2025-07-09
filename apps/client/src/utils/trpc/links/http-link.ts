import { httpBatchLink } from "@trpc/client";
import { withRelatedProject } from "@vercel/related-projects";
import { ERROR_CAUSES } from "@ampedbio/constants";

// Base URL for API calls
const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

/**
 * Refreshes the access token using the refresh token via tRPC
 */
async function refreshToken(): Promise<string | null> {
  try {
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
      throw new Error("Failed to refresh token");
    }

    const data = await response.json();
    const newToken = data.result?.data?.accessToken;

    if (newToken) {
      localStorage.setItem("amped-bio-auth-token", newToken);
      return newToken;
    }

    return null;
  } catch (error) {
    console.error("Token refresh failed:", error);
    // Clear tokens if refresh fails
    localStorage.removeItem("amped-bio-auth-token");
    // Don't clear refresh token cookie as it's handled by the server
    return null;
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
      const token = localStorage.getItem("amped-bio-auth-token");
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

      // First attempt with current token
      let response = await globalThis.fetch(url, fetchOptions);

      // If the first request fails, check if it's due to token expiration
      if (!response.ok) {
        try {
          const errorData = await response.clone().json();

          // Check if the error is specifically about token expiration
          const isTokenExpired =
            errorData.some?.(
              (error: any) => error.error?.data?.cause === ERROR_CAUSES.TOKEN_EXPIRED
            ) || errorData.error?.data?.cause === ERROR_CAUSES.TOKEN_EXPIRED;

          if (isTokenExpired) {
            console.log("Token expired, attempting to refresh...");

            // Try to refresh the token
            const newToken = await refreshToken();

            if (newToken) {
              // Retry the request with the new token
              const newOptions = {
                ...(options as RequestInit),
                credentials: "include" as RequestCredentials,
                headers: {
                  ...(options as RequestInit)?.headers,
                  Authorization: `Bearer ${newToken}`,
                },
              };

              response = await globalThis.fetch(url, newOptions);
              console.log("Request retried with new token");
            } else {
              // Refresh failed, redirect to login or handle as needed
              console.error("Token refresh failed, user needs to re-authenticate");
              // You can dispatch an event here to notify the app to redirect to login
              window.dispatchEvent(new CustomEvent("auth:token-expired"));
            }
          }
        } catch (parseError) {
          // If we can't parse the error, continue with original response
          console.warn("Failed to parse error response:", parseError);
        }
      }

      return response;
    },
  });
};
