"use client";

import React from "react";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import PoolSkeleton from "./PoolSkeleton";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { getChainConfig } from "@repo/web3";
import { formatEther } from "viem";
import { useChainId } from "wagmi";
import Decimal from "decimal.js";
import { formatNumberWithSeparators } from "@/utils/numberUtils";

// Define filter and sort types
export type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
export type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
}

const PoolsTab: React.FC<PoolsTabProps> = ({ searchQuery, poolFilter, poolSort }) => {
  const router = useRouter();
  const chainId = useChainId();

  const {
    data: pools,
    isLoading,
  } = useQuery({
    ...trpc.pools.fan.getPools.queryOptions({
      chainId: chainId.toString(),
      search: searchQuery,
      filter: poolFilter,
      sort: poolSort,
    }),
    enabled: !!chainId,
  });

  const handleViewPool = (poolAddress: string) => {
    router.push(`/i/pools/${poolAddress}`);
  };

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
                        ? formatNumberWithSeparators(
                            Decimal.max(
                              new Decimal("0"),
                              new Decimal(formatEther(pool.stakedAmount)).minus(
                                new Decimal("0.0015")
                              )
                            )
                              .toDecimalPlaces(3, Decimal.ROUND_DOWN)
                              .toString()
                          )
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
                    onClick={() => handleViewPool(pool.address)}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
                  >
                    <Users className="w-4 h-4" />
                    <span>View Pool</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500 col-span-full">No reward pools found.</div>
        )}
      </div>
    </div>
  );
};

export default PoolsTab;
