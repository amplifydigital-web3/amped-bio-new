import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

/**
 * Decoupled render helper for UI tests. Wraps the component in a fresh
 * QueryClientProvider so data hooks never touch a real API/server. Data
 * sources (tRPC hooks, auth, contexts) must be mocked per test file with
 * `vi.mock`; this only guarantees the React Query layer is isolated.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: { queryClient?: QueryClient; renderOptions?: Omit<RenderOptions, "wrapper"> }
): RenderResult & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? new QueryClient({});

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  const rendered = render(ui, { ...options?.renderOptions, wrapper: Wrapper });
  return { ...rendered, queryClient };
}
