import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from "../../../server/src/trpc";
import { withRelatedProject } from '@vercel/related-projects';

const baseURL = withRelatedProject({
  projectName: "amped-bio-server",
  defaultHost: "http://localhost:43000",
});

export const queryClient = new QueryClient();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? baseURL}/trpc`,
      headers() {
        const token = localStorage.getItem("amped-bio-auth-token");
        return token ? {
          Authorization: `Bearer ${token}`,
        } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});