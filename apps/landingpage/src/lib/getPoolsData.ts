import { trpcClient } from "./trpc";
import { AVAILABLE_CHAINS } from "@repo/web3";

/** Shape of the data returned by the getPools query. */
export type PoolsPageData = Awaited<ReturnType<typeof trpcClient.pools.fan.getPools.query>>;

/**
 * Chain used for server-side rendering of the pools list. Mirrors the wagmi
 * default chain (first entry in AVAILABLE_CHAINS), so the SSR data matches
 * what the client would fetch when no wallet is connected.
 */
export const DEFAULT_POOLS_CHAIN_ID = AVAILABLE_CHAINS[0].id.toString();

/**
 * Fetch the public pools list from the API server during SSR.
 * Returns null when the API is unreachable so callers can decide
 * how to render (fallback or client-side loading).
 */
export async function fetchPoolsPageData(
  chainId: string = DEFAULT_POOLS_CHAIN_ID
): Promise<PoolsPageData | null> {
  try {
    return await trpcClient.pools.fan.getPools.query({
      chainId,
      search: "",
      filter: "all",
      sort: "newest",
    });
  } catch {
    return null;
  }
}
