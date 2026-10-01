import React, { useEffect } from "react";
import { Users, Coins } from "lucide-react";
import PoolSkeleton from "./PoolSkeleton";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { useSearchParams } from "react-router";
import PoolPanel from "../pool-panel/PoolPanel";
import { useChainId } from "wagmi";
import { formatTokenAmount } from "../pool-panel/format";

// Define filter and sort types
type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
  shouldOpenModal?: boolean; // If true, open modal instead of navigating to pool page
}

const PoolsTab: React.FC<PoolsTabProps> = ({
  searchQuery,
  poolFilter,
  poolSort,
  shouldOpenModal = false,
}) => {
  const chainId = useChainId();

  const {
    data: pools,
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.pools.fan.getPools.queryOptions({
      chainId: chainId.toString(),
      search: searchQuery,
      filter: poolFilter,
      sort: poolSort,
    }),
    enabled: !!chainId,
  });

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

  const handleJoinPool = (poolId: number) => {
    const pool = pools?.find(p => p.id === poolId);
    if (pool?.address) openPool(pool.address);
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

  // Apply filtering and sorting

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => <PoolSkeleton key={index} />)
        ) : pools && pools.length > 0 ? (
          pools.map(pool => (
            <div
              key={pool.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {pool.image ? (
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                  <img
                    src={pool.image.url}
                    alt={pool.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              ) : (
                <div className="h-32 bg-gray-200" />
              )}

              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{pool.name}</h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {pool.description ?? "No description available."}
                </p>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total Stake</span>
                    <span className="font-semibold text-gray-900">
                      {pool.stakedAmount !== undefined && pool.stakedAmount !== null
                        ? formatTokenAmount(BigInt(pool.stakedAmount))
                        : "0"}{" "}
                      {getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "REVO"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Fans</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.fans ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewPool(pool.id)}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
                  >
                    <Users className="w-4 h-4" />
                    <span>View Pool</span>
                  </button>
                  <button
                    onClick={() => handleJoinPool(pool.id)}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1 bg-blue-600 text-white hover:bg-blue-700`}
                  >
                    <Coins className="w-4 h-4" />
                    <span>Stake</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 col-span-full">No reward pools found.</div>
        )}
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
