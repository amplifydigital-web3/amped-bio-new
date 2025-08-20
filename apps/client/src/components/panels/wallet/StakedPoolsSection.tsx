import React from "react";
import { Trophy, ChevronLeft, ChevronRight, Link, TrendingUp, Clock } from "lucide-react";
import PoolDetailsModal from "./PoolDetailsModal";
import ClaimRewardsModal from "./ClaimRewardsModal";

interface StakedPool {
  id: string;
  title: string;
  description: string;
  stakedAmount: number;
  stakeCurrency: string;
  totalReward: number;
  rewardCurrency: string;
  endDate: string;
  status: "active" | "ending-soon" | "completed";
  category: "staking" | "social" | "trading" | "community";
  earnedRewards: number;
  estimatedRewards: number;
  participants: number;
  image?: string;
}

interface StakedPoolsSectionProps {
  loading?: boolean;
  onNavigateToExplore?: () => void;
}

export default function StakedPoolsSection({
  loading = false,
  onNavigateToExplore,
}: StakedPoolsSectionProps) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedPool, setSelectedPool] = React.useState<StakedPool | null>(null);
  const [isPoolModalOpen, setIsPoolModalOpen] = React.useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = React.useState(false);
  const [claimingPool, setClaimingPool] = React.useState<StakedPool | null>(null);
  const poolsPerPage = 6; // Increased since rows are more compact

  // Mock data for staked pools
  const allStakedPools: StakedPool[] = [
    {
      id: "1",
      title: "REVO Staking Champions",
      description: "Stake 1000+ REVO tokens for 30 days and earn bonus rewards.",
      stakedAmount: 2500,
      stakeCurrency: "REVO",
      totalReward: 50000,
      rewardCurrency: "REVO",
      endDate: "2025-02-15",
      status: "active",
      category: "staking",
      earnedRewards: 125.5,
      estimatedRewards: 375.75,
      participants: 247,
      image:
        "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
    {
      id: "2",
      title: "Social Media Engagement",
      description: "Share your profile and engage with the community.",
      stakedAmount: 500,
      stakeCurrency: "REVO",
      totalReward: 1250,
      rewardCurrency: "REVO",
      endDate: "2025-01-31",
      status: "ending-soon",
      category: "social",
      earnedRewards: 25,
      estimatedRewards: 75,
      participants: 892,
      image:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
    {
      id: "3",
      title: "Trading Volume Challenge",
      description: "Achieve $10,000+ in trading volume this month.",
      stakedAmount: 1000,
      stakeCurrency: "REVO",
      totalReward: 2500,
      rewardCurrency: "REVO",
      endDate: "2025-01-31",
      status: "active",
      category: "trading",
      earnedRewards: 50,
      estimatedRewards: 150,
      participants: 156,
      image:
        "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
    {
      id: "4",
      title: "Creator Spotlight",
      description: "Submit your best content and get featured.",
      stakedAmount: 750,
      stakeCurrency: "REVO",
      totalReward: 5000,
      rewardCurrency: "USDC",
      endDate: "2025-02-28",
      status: "active",
      category: "community",
      earnedRewards: 50,
      estimatedRewards: 200,
      participants: 67,
      image:
        "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
    {
      id: "5",
      title: "DeFi Liquidity Mining",
      description: "Provide liquidity to earn additional rewards.",
      stakedAmount: 3000,
      stakeCurrency: "REVO",
      totalReward: 15000,
      rewardCurrency: "REVO",
      endDate: "2025-03-15",
      status: "active",
      category: "staking",
      earnedRewards: 200,
      estimatedRewards: 600,
      participants: 324,
      image:
        "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
    {
      id: "6",
      title: "NFT Collection Rewards",
      description: "Hold specific NFTs to earn exclusive rewards.",
      stakedAmount: 1500,
      stakeCurrency: "REVO",
      totalReward: 3000,
      rewardCurrency: "REVO",
      endDate: "2025-01-10", // Past date to show "Ended" state
      status: "completed",
      category: "community",
      earnedRewards: 150,
      estimatedRewards: 200,
      participants: 89,
      image:
        "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=400",
    },
  ];

  // Calculate pagination
  const totalPages = Math.ceil(allStakedPools.length / poolsPerPage);
  const startIndex = (currentPage - 1) * poolsPerPage;
  const endIndex = startIndex + poolsPerPage;
  const currentPools = allStakedPools.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const handlePageClick = (page: number) => {
    setCurrentPage(page);
  };

  const handlePoolClick = (pool: StakedPool) => {
    setSelectedPool(pool);
    setIsPoolModalOpen(true);
  };

  const handleClaimRewards = (e: React.MouseEvent, poolId: string) => {
    e.stopPropagation();
    const pool = allStakedPools.find(p => p.id === poolId);
    if (pool) {
      setClaimingPool(pool);
      setIsClaimModalOpen(true);
    }
  };

  const handleViewPool = (e: React.MouseEvent, poolId: string) => {
    e.stopPropagation();
    const pool = allStakedPools.find(p => p.id === poolId);
    if (pool) {
      setSelectedPool(pool);
      setIsPoolModalOpen(true);
    }
  };

  const handleViewAllPools = () => {
    if (onNavigateToExplore) {
      onNavigateToExplore();
    }
  };

  const getRemainingDays = (endDate: string) => {
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return Math.max(0, days);
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

  if (allStakedPools.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 opacity-50 relative pointer-events-none">
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
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200">
            Browse Reward Pools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 opacity-50 relative pointer-events-none">
      <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full z-10 pointer-events-auto">
        Soon
      </div>
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
        {currentPools.map((pool, index) => {
          const remainingDays = getRemainingDays(pool.endDate);
          const isLast = index === currentPools.length - 1;

          return (
            <div key={pool.id} className="relative">
              <div
                onClick={() => handlePoolClick(pool)}
                className={`
                  flex items-center py-3 px-2 hover:bg-gray-50 cursor-pointer transition-colors duration-200 group
                  ${!isLast ? "border-b border-gray-100" : ""}
                `}
              >
                {/* Left Zone (56%) - Thumbnail, Name, Badges */}
                <div
                  className="flex items-center space-x-3 flex-1 min-w-0"
                  style={{ flexBasis: "56%" }}
                >
                  {/* 40x40 Thumbnail */}
                  <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
                    {pool.image ? (
                      <img
                        src={pool.image}
                        alt={`${pool.title} pool`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-gray-500" />
                      </div>
                    )}
                  </div>

                  {/* Pool Name and Badges */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors duration-200">
                      {pool.title}
                    </h4>
                  </div>
                </div>

                {/* Middle Zone (32%) - Stats Pills */}
                <div
                  className="hidden sm:flex items-center space-x-2 flex-shrink-0"
                  style={{ flexBasis: "32%" }}
                >
                  {/* Staked Amount */}
                  <div
                    className="flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded-full group/tooltip relative"
                    title={`You have staked ${pool.stakedAmount.toLocaleString()} ${pool.stakeCurrency} in this pool`}
                  >
                    <Link className="w-3 h-3 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">
                      {pool.stakedAmount >= 1000
                        ? `${(pool.stakedAmount / 1000).toFixed(1)}k`
                        : pool.stakedAmount.toLocaleString()}
                    </span>
                  </div>

                  {/* Earned Rewards */}
                  <div
                    className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full group/tooltip relative"
                    title={`You have earned ${pool.earnedRewards} ${pool.rewardCurrency} from this pool`}
                  >
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs font-medium text-green-700">
                      {pool.earnedRewards >= 1000
                        ? `${(pool.earnedRewards / 1000).toFixed(1)}k`
                        : pool.earnedRewards}
                    </span>
                  </div>

                  {/* Remaining Days */}
                  <div
                    className={`flex items-center space-x-1 px-2 py-1 rounded-full group/tooltip relative ${
                      remainingDays === 0 ? "bg-red-50" : "bg-gray-50"
                    }`}
                    title={
                      remainingDays === 0
                        ? "This pool has ended"
                        : `${remainingDays} days remaining until pool ends`
                    }
                  >
                    <Clock
                      className={`w-3 h-3 ${remainingDays === 0 ? "text-red-600" : "text-gray-600"}`}
                    />
                    <span
                      className={`text-xs font-medium ${remainingDays === 0 ? "text-red-700" : "text-gray-700"}`}
                    >
                      {remainingDays === 0 ? "Ended" : `${remainingDays}d`}
                    </span>
                  </div>
                </div>

                {/* Mobile Stats - Show below on mobile */}
                <div className="sm:hidden w-full mt-2">
                  <div className="flex flex-wrap gap-1.5">
                    <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded-full">
                      <Link className="w-3 h-3 text-blue-600" />
                      <span className="text-xs font-medium text-blue-700">
                        {pool.stakedAmount >= 1000
                          ? `${(pool.stakedAmount / 1000).toFixed(1)}k`
                          : pool.stakedAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full">
                      <TrendingUp className="w-3 h-3 text-green-600" />
                      <span className="text-xs font-medium text-green-700">
                        {pool.earnedRewards >= 1000
                          ? `${(pool.earnedRewards / 1000).toFixed(1)}k`
                          : pool.earnedRewards}
                      </span>
                    </div>
                    <div
                      className={`flex items-center space-x-1 px-2 py-1 rounded-full ${
                        remainingDays === 0 ? "bg-red-50" : "bg-gray-50"
                      }`}
                    >
                      <Clock
                        className={`w-3 h-3 ${remainingDays === 0 ? "text-red-600" : "text-gray-600"}`}
                      />
                      <span
                        className={`text-xs font-medium ${remainingDays === 0 ? "text-red-700" : "text-gray-700"}`}
                      >
                        {remainingDays === 0 ? "Ended" : `${remainingDays}d`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Zone (12%) - Actions */}
                <div
                  className="flex items-center space-x-1 flex-shrink-0 ml-2"
                  style={{ flexBasis: "12%" }}
                >
                  <button
                    onClick={e => handleClaimRewards(e, pool.id)}
                    className="px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors duration-200"
                    title="Claim your earned rewards"
                  >
                    <span className="hidden sm:inline">Claim</span>
                    <span className="sm:hidden">💰</span>
                  </button>

                  <button
                    onClick={e => handleViewPool(e, pool.id)}
                    className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors duration-200"
                    title="View pool details"
                  >
                    <span className="hidden sm:inline">View</span>
                    <span className="sm:hidden">👁️</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
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
        pool={selectedPool}
      />

      {/* Claim Rewards Modal */}
      <ClaimRewardsModal
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
        pool={claimingPool}
      />

      {/* Click outside to close dropdown */}
    </div>
  );
}
