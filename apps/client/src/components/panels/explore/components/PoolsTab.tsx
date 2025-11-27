import React, { useState } from "react";
import { Users, Coins } from "lucide-react";
import PoolSkeleton from "./PoolSkeleton";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";
import { getChainConfig } from "@ampedbio/web3";
import PoolDetailsModal from "../ExplorePoolDetailsModal";
import StakeModal from "../StakeModal";
import { formatEther } from "viem";
import { useChainId } from "wagmi";
import Decimal from "decimal.js";

// Define filter and sort types
type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
}

const PoolsTab: React.FC<PoolsTabProps> = ({ searchQuery, poolFilter, poolSort }) => {
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

  // State for modals and selected pool
  const [selectedStakingPool, setSelectedStakingPool] = useState<any>(null);
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">("stake");
  const [selectedRewardPoolForView, setSelectedRewardPoolForView] = useState<number | null>(null);
  const [isRewardPoolViewModalOpen, setIsRewardPoolViewModalOpen] = useState(false);

  const handleJoinPool = (poolId: number) => {
    if (pools) {
      const pool = pools.find(p => p.id === poolId);
      if (pool) {
        // Criar um objeto que tenha a estrutura esperada pelo useStaking
        // Pass the stakedAmount in its original format to the staking component
        const poolForStaking = {
          id: pool.id,
          name: pool.name, // Include name field as well
          description: pool.description ?? "",
          chainId: pool.chainId,
          address: pool.address,
          image: pool.image,
          currentStake: pool.stakedAmount || 0n, // Use the staked amount from the pool as bigint
        };

        setSelectedStakingPool(poolForStaking);
        setStakingMode("stake");
        setIsStakeModalOpen(true);
      }
    }
  };

  const handleViewPool = (poolId: number) => {
    setSelectedRewardPoolForView(poolId);
    setIsRewardPoolViewModalOpen(true);
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
                        ? Decimal.max(
                            new Decimal("0"),
                            new Decimal(formatEther(pool.stakedAmount)).minus(new Decimal("0.0015"))
                          )
                            .toDecimalPlaces(3, Decimal.ROUND_DOWN)
                            .toString()
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

                <span className="absolute top-2 right-2 inline-flex items-center rounded-full border border-blue-400 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  New
                </span>

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

      {/* Modals */}
      {isStakeModalOpen && selectedStakingPool && (
        <StakeModal
          pool={selectedStakingPool}
          mode={stakingMode}
          isOpen={isStakeModalOpen}
          onClose={() => setIsStakeModalOpen(false)}
          onStakeSuccess={refetch}
        />
      )}
      {isRewardPoolViewModalOpen && selectedRewardPoolForView && (
        <PoolDetailsModal
          poolId={selectedRewardPoolForView}
          isOpen={isRewardPoolViewModalOpen}
          onClose={() => {
            setIsRewardPoolViewModalOpen(false);
            setSelectedRewardPoolForView(null);
          }}
        />
      )}
    </div>
  );
};

export default PoolsTab;
