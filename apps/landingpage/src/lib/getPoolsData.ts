import { trpcClient } from "./trpc";
import { AVAILABLE_CHAINS } from "@repo/web3";

/** One page of pools.list.listPools: the SSR first page of the directory. */
export type PoolsPageData = Awaited<ReturnType<typeof trpcClient.pools.list.listPools.query>>;

/**
 * Chain used for server-side rendering of the pools list. Mirrors the wagmi
 * default chain (first entry in AVAILABLE_CHAINS), so the SSR data matches
 * what the client would fetch when no wallet is connected.
 */
export const DEFAULT_POOLS_CHAIN_ID = AVAILABLE_CHAINS[0].id.toString();

/** Same page size as the directory's Show more (PoolsTab). */
export const POOLS_PAGE_SIZE = 24;

/**
 * Fetch the first page of the public pools list from the API server during SSR.
 * Returns null when the API is unreachable so callers can decide
 * how to render (fallback or client-side loading).
 */
export async function fetchPoolsPageData(
  chainId: string = DEFAULT_POOLS_CHAIN_ID
): Promise<PoolsPageData | null> {
  try {
    return await trpcClient.pools.list.listPools.query({
      chainId,
      filter: "all",
      sort: "newest",
      limit: POOLS_PAGE_SIZE,
    });
  } catch {
    return null;
  }
}
