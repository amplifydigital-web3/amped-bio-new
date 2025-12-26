import { httpBatchLink } from "@trpc/client";
import { withRelatedProject } from "@vercel/related-projects";
import { AUTH_STORAGE_KEYS } from "../../../constants/auth-storage";

// Base URL for API calls
const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

/**
 * Creates an HTTP batch link for TRPC that connects to the backend API.
 * Automatically adds authorization headers.
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
    fetch(url, options) {
      // Ensure credentials are always included
      return globalThis.fetch(url, {
        ...(options as RequestInit),
        credentials: "include" as RequestCredentials,
      });
    },
  });
};
