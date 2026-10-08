import React, { useEffect } from "react";
import PoolSkeleton from "./PoolSkeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PoolCardMedium, trpc } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { useSearchParams } from "react-router";
import PoolPanel from "../pool-panel/PoolPanel";
import { useChainId } from "wagmi";
import { formatTokenAmount } from "../pool-panel/format";
import { TestnetLine } from "../pool-panel/sections";

// Define filter and sort types
type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
  shouldOpenModal?: boolean; // If true, open modal instead of navigating to pool page
  // 045 I10: the result count beside Sort, and Searching while a new query loads
  onResult?: (result: { count: number; fetching: boolean }) => void;
  // 045 I13: Clear search and Clear filter in the no results state
  emptyActions?: React.ReactNode;
}

const PoolsTab: React.FC<PoolsTabProps> = ({
  searchQuery,
  poolFilter,
  poolSort,
  shouldOpenModal = false,
  onResult,
  emptyActions,
}) => {
  const chainId = useChainId();

  const {
    data: pools,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    ...trpc.pools.fan.getPools.queryOptions({
      chainId: chainId.toString(),
      search: searchQuery,
      filter: poolFilter,
      sort: poolSort,
    }),
    enabled: !!chainId,
    // Keep the current results on screen while a new query loads (045 I10)
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!pools) return;
    onResult?.({ count: pools.length, fetching: isFetching && isPlaceholderData });
  }, [pools, isFetching, isPlaceholderData, onResult]);

  // The open pool lives in ?pool=<address> (D27), so the panel survives a
  // reload and the link can be shared. Legacy ?pa= links are rewritten.
  const [params, setParams] = useSearchParams();
  const selectedPoolAddress = params.get("pool");

  useEffect(() => {
    const legacy = params.get("pa");
    if (!legacy) return;
    const next = new URLSearchParams(params);
    next.delete("pa");
    if (!next.get("pool")) next.set("pool", legacy);
    setParams(next, { replace: true });
  }, [params, setParams]);

  const openPool = (address: string) => {
    const next = new URLSearchParams(params);
    next.set("pool", address);
    setParams(next, { replace: true });
  };

  const closePool = () => {
    const next = new URLSearchParams(params);
    next.delete("pool");
    setParams(next, { replace: true });
  };

  const handleViewPool = (poolId: number) => {
    if (pools) {
      const pool = pools.find(p => p.id === poolId);
      if (pool && pool.address) {
        if (shouldOpenModal) {
          openPool(pool.address);
        } else {
          // The dedicated pool page lives on the public site
          window.location.href = `${import.meta.env.VITE_LANDINGPAGE_URL}/i/pools/${pool.address}`;
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 086 (QA): every pool list carries the verbatim testnet line. Above the
          list at 390, under it on desktop. */}
      <div className="sm:hidden">
        <TestnetLine />
      </div>
      {/* Prism medium pool cards (QA-028), the same card as the public pools
          directory (070). The whole card opens the pool panel. */}
      <ul className="grid grid-cols-1 gap-[21px] sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <li key={index}>
              <PoolSkeleton />
            </li>
          ))
        ) : pools && pools.length > 0 ? (
          pools.map(pool => {
            const symbol = getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "tREVO";
            const staked = `${
              pool.stakedAmount !== undefined && pool.stakedAmount !== null
                ? formatTokenAmount(BigInt(pool.stakedAmount))
                : "0"
            } ${symbol}`;
            const fans = `${(pool.fans ?? 0).toLocaleString("en-US")} ${pool.fans === 1 ? "fan" : "fans"}`;
            return (
              <li key={pool.id}>
                <PoolCardMedium
                  onSelect={() => handleViewPool(pool.id)}
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
          })
        ) : (
          <li className="col-span-full space-y-3 py-8 text-center font-prism text-prism-body text-prism-ink-2">
            <p>No pools found.</p>
            {emptyActions}
          </li>
        )}
      </ul>
      <div className="hidden sm:block">
        <TestnetLine />
      </div>

      {/* Pool details and the stake, unstake and claim flows (rows 046 to 048) */}
      <PoolPanel
        open={!!selectedPoolAddress}
        onOpenChange={next => {
          if (!next) closePool();
        }}
        poolAddress={selectedPoolAddress ?? undefined}
        onChanged={refetch}
      />
    </div>
  );
};

export default PoolsTab;
