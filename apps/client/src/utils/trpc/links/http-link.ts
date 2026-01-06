import { httpBatchLink } from "@trpc/client";
import { withRelatedProject } from "@vercel/related-projects";

// Base URL for API calls
const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

/**
 * Creates an HTTP batch link for TRPC that connects to the backend API.
 * better-auth session cookies are automatically included via credentials: "include"
 */
export const createHttpLink = () => {
  return httpBatchLink({
    url: `${import.meta.env.VITE_API_URL ?? baseURL}/trpc`,
    fetch(url, options) {
      // Include credentials to send better-auth session cookies
      return globalThis.fetch(url, {
        ...(options as RequestInit),
        credentials: "include" as RequestCredentials,
      });
    },
  });
};
