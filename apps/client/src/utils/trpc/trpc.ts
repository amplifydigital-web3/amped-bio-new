import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../../server/src/trpc";
import { mockLink } from "./links/mock/mock-link";
import { createHttpLink } from "./links/http-link";

// Create query client for React Query
export const queryClient = new QueryClient();

// Use DEMO mode if explicitly set in environment
const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

// Create TRPC client with appropriate link
export const trpcClient = createTRPCClient<AppRouter>({
  links: [isDemoMode ? mockLink() : createHttpLink()],
});

// Create and export the TRPC options proxy for use in components
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
