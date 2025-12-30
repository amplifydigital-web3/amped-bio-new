import React from "react";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import ExplorePoolDetailsModal from "../explore/ExplorePoolDetailsModal";
import { useAccount } from "wagmi";
import StakedPoolRow from "./StakedPoolRow";
import { useEditor } from "../../../contexts/EditorContext";
import { useStakedPools } from "./hooks/useStakedPools";

export default function StakedPoolsSection() {
  const {
    stakedPools: allStakedPools,
    isLoading: loading,
    refetch: refetchAllStakedPools,
    claimAll,
    isClaiming,
  } = useStakedPools();
  const { chainId: currentChainId } = useAccount();

  const { setActivePanelAndNavigate } = useEditor();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedPoolId, setSelectedPoolId] = React.useState<number | null>(null);
  const [isExplorePoolModalOpen, setIsExplorePoolModalOpen] = React.useState(false);
  const poolsPerPage = 6;

  const selectedExplorePool = allStakedPools?.find(p => p.pool.id === selectedPoolId) || null;

  const totalPendingRewards =
    allStakedPools?.reduce((acc, pool) => {
      return acc + (pool.pendingRewards ? BigInt(pool.pendingRewards) : 0n);
    }, 0n) ?? 0n;

  const canClaimAll = totalPendingRewards > 0n && !isClaiming;

  // Calculate pagination
  const totalPages = allStakedPools ? Math.ceil(allStakedPools.length / poolsPerPage) : 0;
  const startIndex = (currentPage - 1) * poolsPerPage;
  const endIndex = startIndex + poolsPerPage;
  const currentPools = allStakedPools ? allStakedPools.slice(startIndex, endIndex) : [];

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  const handlePoolClick = (poolId: number) => {
    setSelectedPoolId(poolId);
    // Use the ExplorePoolDetailsModal instead of the current PoolDetailsModal
    setIsExplorePoolModalOpen(true);
  };

  // Check if creator pool feature is enabled
  const showCreatorPool = import.meta.env.VITE_SHOW_CREATOR_POOL === "true";

  const handleViewAllPools = () => {
    if (showCreatorPool) {
      setActivePanelAndNavigate("explore", "pools");
    }
  };

  // Skeleton Loading Component
  const SkeletonLoader = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
        <div>
          <div className="h-6 bg-gray-200 rounded animate-pulse w-40 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
        </div>
        <div className="flex items-center justify-between sm:justify-end space-x-4">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-20"></div>
          <div className="w-5 h-5 bg-gray-200 rounded animate-pulse"></div>
        </div>
      </div>

      {/* Skeleton Pool Rows */}
      <div className="space-y-0">
        {Array.from({ length: poolsPerPage }).map((_, index) => {
          const isLast = index === poolsPerPage - 1;

          return (
            <div key={index} className="relative">
              <div
                className={`flex items-center py-3 px-2 ${!isLast ? "border-b border-gray-100" : ""}`}
              >
                {/* Left Zone - Thumbnail and Title */}
                <div
                  className="flex items-center space-x-3 flex-1 min-w-0"
                  style={{ flexBasis: "56%" }}
                >
                  <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-32"></div>
                  </div>
                </div>

                {/* Middle Zone - Stats Pills */}
                <div
                  className="hidden sm:flex items-center space-x-2 flex-shrink-0"
                  style={{ flexBasis: "32%" }}
                >
                  <div className="h-6 bg-gray-200 rounded-full animate-pulse w-12"></div>
                  <div className="h-6 bg-gray-200 rounded-full animate-pulse w-10"></div>
                  <div className="h-6 bg-gray-200 rounded-full animate-pulse w-8"></div>
                </div>

                {/* Mobile Stats - Show below on mobile */}
                <div className="sm:hidden w-full mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    <div className="h-6 bg-gray-200 rounded-full animate-pulse w-12"></div>
                    <div className="h-6 bg-gray-200 rounded-full animate-pulse w-10"></div>
                    <div className="h-6 bg-gray-200 rounded-full animate-pulse w-8"></div>
                  </div>
                </div>

                {/* Right Zone - Actions */}
                <div
                  className="flex items-center space-x-1 flex-shrink-0 ml-2"
                  style={{ flexBasis: "12%" }}
                >
                  <div className="h-7 bg-gray-200 rounded-md animate-pulse w-12"></div>
                  <div className="h-7 bg-gray-200 rounded-md animate-pulse w-12"></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Skeleton Pagination */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
        <div className="h-9 bg-gray-200 rounded-lg animate-pulse w-20"></div>
        <div className="flex items-center space-x-1 sm:space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-lg animate-pulse"
            ></div>
          ))}
        </div>
        <div className="h-9 bg-gray-200 rounded-lg animate-pulse w-16"></div>
      </div>

      {/* Skeleton View All Link */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="h-10 bg-gray-200 rounded animate-pulse w-full"></div>
      </div>
    </div>
  );

  // Show skeleton if loading
  if (loading) {
    return <SkeletonLoader />;
  }

  if (!allStakedPools || allStakedPools.length === 0) {
    const showCreatorPool = import.meta.env.VITE_SHOW_CREATOR_POOL === "true";

    return (
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${showCreatorPool ? "" : "opacity-50"} relative ${showCreatorPool ? "" : "pointer-events-none"}`}
      >
        <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10 pointer-events-auto">
          Soon
        </div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Your Staked Pools</h3>
          <Trophy className="w-5 h-5 text-gray-400" />
        </div>

        <div className="text-center py-8">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Active Stakes</h4>
          <p className="text-gray-500 mb-4">You haven't staked in any reward pools yet.</p>
          <button
            onClick={handleViewAllPools}
            disabled={!showCreatorPool}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              showCreatorPool
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-300 text-white cursor-not-allowed opacity-50"
            }`}
          >
            Browse Reward Pools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Your Staked Pools</h3>
          <p className="text-sm text-gray-600 mt-1">
            {allStakedPools.length} active stake{allStakedPools.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* <div className="flex items-center justify-between sm:justify-end space-x-4">
          <button
            onClick={() => void claimAll()}
            disabled={!canClaimAll}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              canClaimAll
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-gray-200 text-gray-500 cursor-not-allowed"
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>{isClaiming ? "Claiming..." : "Claim All"}</span>
          </button>
          <Trophy className="w-5 h-5 text-gray-400" />
        </div> */}
      </div>

      {/* Pool Rows */}
      <div className="space-y-0">
        {currentPools.map(poolData => (
          <StakedPoolRow
            key={poolData.pool.id}
            poolData={poolData}
            refetchAllStakedPools={refetchAllStakedPools}
            onViewPool={handlePoolClick}
            currentChainId={currentChainId?.toString() ?? "0"}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
          <button
            onClick={handlePreviousPage}
            disabled={currentPage === 1}
            className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentPage === 1
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
            <span>Previous</span>
          </button>

          <div className="flex items-center space-x-1 sm:space-x-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => handlePageClick(page)}
                className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg font-medium transition-colors duration-200 text-sm ${
                  currentPage === page
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors duration-200 text-sm ${
              currentPage === totalPages
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <span>Next</span>
            <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* View All Pools Link */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={handleViewAllPools}
          disabled={!showCreatorPool}
          className={`w-full text-center text-sm font-medium transition-colors duration-200 py-2 ${
            showCreatorPool
              ? "text-blue-600 hover:text-blue-700 cursor-pointer"
              : "text-gray-400 cursor-not-allowed opacity-50"
          }`}
        >
          View All Reward Pools →
        </button>
      </div>

      {/* Explore Pool Details Modal - For viewing staked pools */}
      {selectedExplorePool && (
        <ExplorePoolDetailsModal
          isOpen={isExplorePoolModalOpen}
          onClose={() => setIsExplorePoolModalOpen(false)}
          poolId={selectedExplorePool.pool.id}
          onStakeSuccess={refetchAllStakedPools}
        />
      )}
    </div>
  );
}
