import React from "react";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";
import PoolDetailsModal from "./PoolDetailsModal";
import ClaimRewardsModal from "./ClaimRewardsModal";
import { trpc } from "../../../utils/trpc";
import StakedPoolRow from "./StakedPoolRow";
import { useQuery } from "@tanstack/react-query";
import { useEditor } from "../../../contexts/EditorContext";

export default function StakedPoolsSection() {
  const {
    data: allStakedPools,
    isLoading: loading,
    error,
  } = useQuery(trpc.pools.fan.getUserStakes.queryOptions());

  const { setActivePanelAndNavigate } = useEditor();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedPoolId, setSelectedPoolId] = React.useState<number | null>(null);
  const [isPoolModalOpen, setIsPoolModalOpen] = React.useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = React.useState(false);
  const [claimingPoolId, setClaimingPoolId] = React.useState<number | null>(null);
  const poolsPerPage = 6;

  const selectedPool = allStakedPools?.find(p => p.poolId === selectedPoolId)?.pool || null;
  const claimingPool = allStakedPools?.find(p => p.poolId === claimingPoolId) || null;

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
    setIsPoolModalOpen(true);
  };

  const handleClaimRewards = (poolId: number) => {
    setClaimingPoolId(poolId);
    setIsClaimModalOpen(true);
  };

  const handleViewAllPools = () => {
    setActivePanelAndNavigate("explore", "pools");
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

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-900">Error</h3>
        <p className="text-red-700">{error.message}</p>
      </div>
    );
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
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
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
        <div className="flex items-center justify-between sm:justify-end space-x-4">
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <Trophy className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Pool Rows */}
      <div className="space-y-0">
        {currentPools.map(poolData => (
          <StakedPoolRow
            key={poolData.poolId}
            poolData={poolData}
            onClaimRewards={handleClaimRewards}
            onViewPool={handlePoolClick}
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
          className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors duration-200 py-2"
        >
          View All Reward Pools →
        </button>
      </div>

      {/* Pool Details Modal */}
      <PoolDetailsModal
        isOpen={isPoolModalOpen}
        onClose={() => setIsPoolModalOpen(false)}
        pool={
          selectedPool
            ? {
                id: selectedPool.id.toString(),
                title: selectedPool.description || "Untitled Pool",
                description: selectedPool.description || "No description available",
                stakedAmount: 0, // This should be fetched on-chain
                chainId: selectedPool.chainId,
                totalReward: 0, // This should be fetched on-chain
                category: "staking",
                earnedRewards: 0, // This should be fetched on-chain
                estimatedRewards: 0, // This should be fetched on-chain
                participants: 0, // This should be fetched on-chain
                imageUrl: selectedPool.imageUrl,
              }
            : null
        }
      />

      {/* Claim Rewards Modal */}
      <ClaimRewardsModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        pool={
          claimingPool
            ? {
                id: claimingPool.poolId.toString(),
                title: claimingPool.pool.description || "Untitled Pool",
                earnedRewards: 0, // This will be fetched by the modal
                chainId: claimingPool.pool.chainId,
                image: claimingPool.pool.imageUrl || undefined,
              }
            : null
        }
      />
    </div>
  );
}