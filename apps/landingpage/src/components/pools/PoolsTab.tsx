"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useChainId } from "wagmi";
import Decimal from "decimal.js";
import { SearchX, Trophy } from "lucide-react";
import { Button, EmptyState, ErrorCard, PoolCardMedium } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { trpc } from "@/lib/trpc";
import type { PoolsPageData } from "@/lib/getPoolsData";
import { SHOW_MOTION } from "@/components/landing/motion/flag";
import PoolSkeleton from "./PoolSkeleton";

export type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
export type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

// Same as POOLS_PAGE_SIZE in lib/getPoolsData (the SSR first page)
const PAGE_SIZE = 24;

// Total staked as the contract reports it (creator plus fan stake, D28):
// 4 decimals, rounded down, trailing zeros removed, digit grouping.
export function formatStaked(wei: bigint | string | number): string {
  const [whole, fraction] = new Decimal(formatEther(BigInt(wei)))
    .toDecimalPlaces(4, Decimal.ROUND_DOWN)
    .toFixed()
    .split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
  initialData?: PoolsPageData | null;
  onCount?: (shown: number, total: number) => void;
  onClearSearch: () => void;
  onShowAll: () => void;
}

function useDelayed(active: boolean, ms: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return setShown(false);
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

// Pools grid (Screen Review 070): section 9 Medium cards where the whole card
// is the link, 24 per page with Show more (pools.list.listPools, D7 PL3), and
// the empty, no results, loading and error states.
const PoolsTab: React.FC<PoolsTabProps> = ({
  searchQuery,
  poolFilter,
  poolSort,
  initialData,
  onCount,
  onClearSearch,
  onShowAll,
}) => {
  const chainId = useChainId();
  const isDefaultQuery = !searchQuery && poolFilter === "all" && poolSort === "newest";

  const query = useInfiniteQuery({
    ...trpc.pools.list.listPools.infiniteQueryOptions(
      {
        chainId: chainId.toString(),
        search: searchQuery,
        filter: poolFilter,
        sort: poolSort,
        limit: PAGE_SIZE,
      },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    ),
    enabled: !!chainId,
    // The SSR first page matches the default query only
    initialData:
      isDefaultQuery && initialData ? { pages: [initialData], pageParams: [null] } : undefined,
  });
  const { data, isFetching, isError, refetch } = query;

  // A pool whose stake moves between two page loads can come back on a later
  // page. Keep the first copy (spec acceptance 2).
  const pools = useMemo(() => {
    if (!data) return undefined;
    const seen = new Set<number>();
    return data.pages
      .flatMap(page => page.pools)
      .filter(pool => (seen.has(pool.id) ? false : (seen.add(pool.id), true)));
  }, [data]);
  // The total comes with the first page only
  const total = data?.pages[0]?.total ?? 0;
  const shown = Math.min(pools?.length ?? 0, total);
  useEffect(() => {
    // No count until the list has loaded, so a pending query never reads as 0 pools
    if (pools) onCount?.(shown, total);
  }, [pools, shown, total, onCount]);

  const showSkeleton = useDelayed(isFetching && !pools, 400);

  if (!pools) {
    if (isError) {
      return (
        <ErrorCard
          title="Pools did not load"
          cause="Check your connection and try again."
          onRetry={() => void refetch()}
          retryLabel="Retry"
        />
      );
    }
    return showSkeleton ? (
      <div className="grid grid-cols-1 gap-[21px] sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <PoolSkeleton key={index} />
        ))}
      </div>
    ) : null;
  }

  if (pools.length === 0) {
    if (searchQuery) {
      return (
        <EmptyState
          icon={SearchX}
          title={`No pools match '${searchQuery}'`}
          action={
            <Button variant="ghost" onClick={onClearSearch}>
              Clear search
            </Button>
          }
        />
      );
    }
    if (poolFilter !== "all") {
      return (
        <EmptyState
          icon={SearchX}
          title="No pools match this filter"
          action={
            <Button variant="ghost" onClick={onShowAll}>
              Show all pools
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={Trophy}
        title="No pools found."
        description="Creators launch pools from My Pool."
        action={
          <Button variant="secondary" asChild>
            <a href={`${process.env.NEXT_PUBLIC_PANEL_URL || ""}/my-pool`}>Create a pool</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-[34px]">
      <ul data-pool-grid className="grid grid-cols-1 gap-[21px] sm:grid-cols-2 lg:grid-cols-4">
        {pools.map(pool => {
          const symbol = getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "tREVO";
          const staked = `${formatStaked(pool.stakedAmount ?? 0)} ${symbol}`;
          const fans = `${(pool.fans ?? 0).toLocaleString("en-US")} ${pool.fans === 1 ? "fan" : "fans"}`;
          return (
            // Cards rise once as they enter the screen (#26, CSS scroll timeline, no script)
            <li key={pool.id} className={SHOW_MOTION ? "motion-reveal" : undefined}>
              <PoolCardMedium
                href={`/i/pools/${pool.address}`}
                ariaLabel={`${pool.name}, ${fans}, ${staked} staked`}
                pool={{
                  name: pool.name,
                  artUrl: pool.image?.url,
                  stats: [
                    { label: "Fans", value: fans },
                    { label: "Total staked", value: staked },
                  ],
                }}
              />
            </li>
          );
        })}
      </ul>
      {query.isFetchNextPageError ? (
        <ErrorCard
          title="Pools did not load"
          cause="Check your connection and try again."
          onRetry={() => void query.fetchNextPage()}
          retryLabel="Retry"
        />
      ) : (
        query.hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={query.isFetchingNextPage}
              onClick={() => {
                const before = pools.length;
                void query.fetchNextPage().then(() => {
                  // Focus moves to the first new card
                  requestAnimationFrame(() => {
                    const cards =
                      document.querySelectorAll<HTMLAnchorElement>("[data-pool-grid] li a");
                    cards[before]?.focus();
                  });
                });
              }}
            >
              {query.isFetchingNextPage ? "Loading" : "Show more pools"}
            </Button>
          </div>
        )
      )}
    </div>
  );
};

export default PoolsTab;
