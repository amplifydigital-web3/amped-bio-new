import { httpBatchLink } from '@trpc/client';
import { withRelatedProject } from '@vercel/related-projects';

// Base URL for API calls
const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: import.meta.env.VITE_API_URL ?? "http://localhost:43000",
});

/**
 * Creates an HTTP batch link for TRPC that connects to the backend API.
 * Automatically adds authorization headers if a token is present.
 */
export const createHttpLink = () => {
  return httpBatchLink({
    url: `${import.meta.env.VITE_API_URL ?? baseURL}/trpc`,
    headers() {
      const token = localStorage.getItem("amped-bio-auth-token");
      return token ? {
        Authorization: `Bearer ${token}`,
      } : {};
    },
  });
};
