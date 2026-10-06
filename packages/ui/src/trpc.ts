"use client";
import { QueryClient } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter, RouterOutputs } from "../../../apps/server/src/trpc";
import { mockLink } from "./trpc-links/mock/mock-link";

/**
 * Retry only failures that can pass on a second try: network errors and 5xx.
 * A 4xx (unknown procedure, bad input, signed out, forbidden, rate limited)
 * fails the same way every time. Retrying it only delays the error state, and
 * React Query pauses retries while the tab is hidden, so a hidden tab could
 * keep a query pending with no error shown (QA-009).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  const status = (error as { data?: { httpStatus?: unknown } } | null)?.data?.httpStatus;
  return !(typeof status === "number" && status >= 400 && status < 500);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetryQuery } },
});

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

// Use DEMO mode if explicitly set in environment
const isDemoMode = env.VITE_DEMO_MODE === "true";

const TRPC_SERVER_URL = `${env.VITE_API_URL ?? ""}/trpc`;

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
