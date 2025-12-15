import React, { useState, useEffect } from "react";
import { Users, Coins } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  shouldOpenModal?: boolean; // If true, open modal instead of navigating to pool page
}

const PoolsTab: React.FC<PoolsTabProps> = ({ searchQuery, poolFilter, poolSort, shouldOpenModal = false }) => {
  const navigate = useNavigate();
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

  // State for pool address detection (for opening modal directly from URL)
  const [poolAddressFromParam, setPoolAddressFromParam] = useState<string | null>(null);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [selectedPoolAddress, setSelectedPoolAddress] = useState<string | null>(null);

  // Check for pool address parameter on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const poolAddress = urlParams.get("pa"); // Using 'pa' parameter for pool address to avoid conflict with panel param

      // Validate if it looks like an Ethereum address
      if (poolAddress && /^0x[a-fA-F0-9]{40}$/.test(poolAddress)) {
        setPoolAddressFromParam(poolAddress);
        setSelectedPoolAddress(poolAddress);
        // Open modal directly with the address
        setIsPoolModalOpen(true);
      }
    }
  }, []);

  // State for modals and selected pool
  const [selectedStakingPool, setSelectedStakingPool] = useState<any>(null);
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">("stake");

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
    if (pools) {
      const pool = pools.find(p => p.id === poolId);
      if (pool && pool.address) {
        if (shouldOpenModal) {
          // Open modal instead of navigating
          setSelectedPoolAddress(pool.address);
          setIsPoolModalOpen(true);
        } else {
          // Navigate to the dedicated pool page
          navigate(`/i/pools/${pool.address}`);
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
      {/* Pool Details Modal for both URL parameter and clicked pools */}
      {isPoolModalOpen && (poolAddressFromParam || selectedPoolAddress) && (
        <PoolDetailsModal
          poolAddress={poolAddressFromParam || selectedPoolAddress || undefined} // Use either URL parameter or selected pool, ensuring it's string or undefined for the prop
          isOpen={isPoolModalOpen}
          onClose={() => {
            setIsPoolModalOpen(false);
            setPoolAddressFromParam(null);
            setSelectedPoolAddress(null);
          }}
        />
      )}
    </div>
  );
};

export default PoolsTab;
