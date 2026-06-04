import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter, RouterOutputs } from "../../../../server/src/trpc";
import { mockLink } from "./links/mock/mock-link";

export const queryClient = new QueryClient();

// Use DEMO mode if explicitly set in environment
const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

const TRPC_SERVER_URL = `${import.meta.env.VITE_API_URL ?? ""}/trpc`;

// Create TRPC client with split links: subscriptions use SSE, everything else uses HTTP batching
export const trpcClient = createTRPCClient<AppRouter>({
  links: isDemoMode
    ? [mockLink()]
    : [
        splitLink({
          condition: op => op.type === "subscription",
          true: httpSubscriptionLink({
            url: TRPC_SERVER_URL,
            eventSourceOptions: async () => ({
              withCredentials: true,
            }),
          }),
          false: httpBatchLink({
            url: TRPC_SERVER_URL,
            fetch(url, options) {
              return globalThis.fetch(url, {
                ...(options as RequestInit),
                credentials: "include" as RequestCredentials,
              });
            },
          }),
        }),
      ],
});

// https://trpc.io/docs/client/tanstack-react-query/setup#3b-setup-without-react-context
// Create and export the TRPC options proxy for use in components
export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
export { RouterOutputs };
