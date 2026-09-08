import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "../../../server/src/trpc";

export const queryClient = new QueryClient();

const TRPC_SERVER_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/trpc`;

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
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

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
