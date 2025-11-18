import React, { useState } from "react";
import { Users, Coins } from "lucide-react";
import PoolSkeleton from "./PoolSkeleton";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../../utils/trpc";
import { getChainConfig } from "@ampedbio/web3";
import PoolDetailsModal from "../ExplorePoolDetailsModal";
import StakingModal from "../StakingModal";
import { useStaking } from "../../../../hooks/useStaking";
import { RewardPool } from "@ampedbio/constants";

// Define filter and sort types
type PoolFilter = 'all' | 'no-fans' | 'more-than-10-fans' | 'more-than-10k-stake';
type PoolSort = 'newest' | 'name-asc' | 'name-desc';

interface Pool {
  id: number;
  name: string;
  description: string | null;
  stakedAmount: number | null;
  participants: number | null;
  imageUrl: string | null;
  chainId: string;
  walletId: number;
  poolAddress?: string | null;
  totalReward?: number;
  createdBy?: string;
  creatorAddress?: string | null;
  image_file_id?: number | null;
}

interface PoolsTabProps {
  searchQuery: string;
  poolFilter: PoolFilter;
  poolSort: PoolSort;
}

const PoolsTab: React.FC<PoolsTabProps> = ({
  searchQuery,
  poolFilter,
  poolSort
}) => {
  const { data: pools, isLoading } = useQuery(
    trpc.pools.fan.getPools.queryOptions({
      search: searchQuery,
      filter: poolFilter,
      sort: poolSort
    })
  );

  // State for modals and selected pool
  const [selectedStakingPool, setSelectedStakingPool] = useState<any>(null);
  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">("stake");
  const [selectedRewardPoolForView, setSelectedRewardPoolForView] = useState<RewardPool | null>(null);
  const [isRewardPoolViewModalOpen, setIsRewardPoolViewModalOpen] = useState(false);

  // Hook de staking para o pool selecionado
  const {
    stake: stakeFunction,
    unstake: unstakeFunction,
    isStaking: stakingState,
    stakeActionError: stakingError,
  } = useStaking(selectedStakingPool);

  const handleJoinPool = (poolId: number) => {
    if (pools) {
      const pool = pools.find(p => p.id === poolId);
      if (pool) {
        // Criar um objeto que tenha a estrutura esperada pelo useStaking
        const poolForStaking = {
          id: pool.id,
          name: pool.name, // Include name field as well
          description: pool.description ?? "",
          chainId: pool.chainId,
          poolAddress: pool.poolAddress,
          imageUrl: pool.imageUrl,
          currentStake: 0,
        };

        setSelectedStakingPool(poolForStaking);
        setStakingMode("stake");
        setIsStakingModalOpen(true);
      }
    }
  };

  const handleViewPool = (poolId: number) => {
    if (pools) {
      const pool = pools.find(p => p.id === poolId);
      if (pool) {
        const poolForView: RewardPool = {
          id: pool.id,
          description: pool.description,
          chainId: pool.chainId,
          userId: pool.userId, // Using actual userId from updated server response
          poolAddress: pool.poolAddress,
          image_file_id: pool.image_file_id,
          imageUrl: pool.imageUrl,
          name: pool.name, // Use name from blockchain
          totalReward: pool.totalReward || 0, // Placeholder
          stakedAmount: pool.stakedAmount || 0, // Add stakedAmount
          participants: pool.participants || 0, // Placeholder
          createdBy: pool.createdBy || "Unknown", // Placeholder
          earnedRewards: 0,
          creatorAddress: pool.creatorAddress, // Add creatorAddress
        };

        setSelectedRewardPoolForView(poolForView);
        setIsRewardPoolViewModalOpen(true);
      }
    }
  };

  // Apply filtering and sorting
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <PoolSkeleton key={index} />
          ))
        ) : pools && pools.length > 0 ? (
          pools.map(pool => (
            <div
              key={pool.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {pool.imageUrl ? (
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                  <img
                    src={pool.imageUrl}
                    alt={pool.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              ) : (
                <div className="h-32 bg-gray-200" />
              )}

              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {pool.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {pool.description ?? "No description available."}
                </p>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total Stake</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.stakedAmount ?? 0).toLocaleString()}{" "}
                      {getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "REVO"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Participants</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.participants ?? 0).toLocaleString()}
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
          <div className="text-center py-8 text-gray-500 col-span-full">
            No reward pools found.
          </div>
        )}
      </div>

      {/* Modals */}
      {isStakingModalOpen && selectedStakingPool && (
        <StakingModal
          pool={selectedStakingPool}
          mode={stakingMode}
          isOpen={isStakingModalOpen}
          onClose={() => setIsStakingModalOpen(false)}
          onStake={stakeFunction}
          onUnstake={unstakeFunction}
          isStaking={stakingState}
          stakeActionError={stakingError}
        />
      )}
      {isRewardPoolViewModalOpen && selectedRewardPoolForView && (
        <PoolDetailsModal
          pool={selectedRewardPoolForView}
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