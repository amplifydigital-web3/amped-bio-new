"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useChainId } from "wagmi";
import Decimal from "decimal.js";
import { SearchX, Trophy } from "lucide-react";
import { Button, EmptyState, ErrorCard, PoolCardMedium } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { trpc } from "@/lib/trpc";
import type { PoolsPageData } from "@/lib/getPoolsData";
import PoolSkeleton from "./PoolSkeleton";

export type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
export type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

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
// is the link, 24 per step with Show more, and the empty, no results, loading
// and error states.
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
  const [limit, setLimit] = useState(PAGE_SIZE);

  const {
    data: pools,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    ...trpc.pools.fan.getPools.queryOptions({
      chainId: chainId.toString(),
      search: searchQuery,
      filter: poolFilter,
      sort: poolSort,
    }),
    enabled: !!chainId,
    // The SSR list matches the default query only
    initialData: isDefaultQuery ? (initialData ?? undefined) : undefined,
  });

  useEffect(() => setLimit(PAGE_SIZE), [searchQuery, poolFilter, poolSort]);

  const total = pools?.length ?? 0;
  const shown = Math.min(limit, total);
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

  if (total === 0) {
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
        title="No reward pools found."
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
        {pools.slice(0, shown).map(pool => {
          const symbol = getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "tREVO";
          const staked = `${formatStaked(pool.stakedAmount ?? 0)} ${symbol}`;
          const fans = `${(pool.fans ?? 0).toLocaleString("en-US")} ${pool.fans === 1 ? "fan" : "fans"}`;
          return (
            <li key={pool.id}>
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
      {shown < total && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => {
              setLimit(value => value + PAGE_SIZE);
              // Focus moves to the first new card
              requestAnimationFrame(() => {
                const cards = document.querySelectorAll<HTMLAnchorElement>("[data-pool-grid] li a");
                cards[shown]?.focus();
              });
            }}
          >
            Show more pools
          </Button>
        </div>
      )}
    </div>
  );
};

export default PoolsTab;
