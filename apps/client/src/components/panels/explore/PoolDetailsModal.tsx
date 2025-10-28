import React, { useState, useEffect } from "react";
import {
  X,
  Trophy,
  Users,
  Coins,
  TrendingUp,
  ExternalLink,
  Plus,
  Minus,
  Share2,
} from "lucide-react";
import StakingModal from "./StakingModal";
import { usePoolReader } from "../../../hooks/usePoolReader";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";

interface PoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: {
    id: number;
    title: string;
    description: string | null;
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
    imageUrl?: string | null;
    chainId: string;
    userId: number;
    poolAddress: string | null;
    image_file_id: number | null;
  } | null;
}

export default function PoolDetailsModal({
  isOpen,
  onClose,
  pool,
}: PoolDetailsModalProps) {
  const { getFanStake, creatorCut: contractCreatorCut, isReadingCreatorCut } = usePoolReader(pool?.poolAddress as `0x${string}` | undefined);
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const [fanStake, setFanStake] = useState("0");

  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">(
    "stake"
  );

  useEffect(() => {
    if (isOpen && pool?.poolAddress && userAddress && publicClient) {
      const fetchStake = async () => {
        const stake = await getFanStake(publicClient, userAddress);
        if (stake !== null) {
          setFanStake(formatEther(stake));
        }
      };
      fetchStake();
    }
  }, [isOpen, pool?.poolAddress, userAddress, getFanStake, publicClient]);

  if (!isOpen || !pool) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleShare = () => {
    const poolUrl = `${window.location.origin}/pool/${pool.id}`;

    if (navigator.share) {
      navigator
        .share({
          title: pool.title,
          text: `Check out this reward pool: ${pool.title}`,
          url: poolUrl,
        })
        .catch(console.error);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard
        .writeText(poolUrl)
        .then(() => {
          console.log("Pool link copied to clipboard");
          // You could show a toast notification here
        })
        .catch(console.error);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "staking":
        return "bg-blue-500 text-white";
      case "social":
        return "bg-green-500 text-white";
      case "trading":
        return "bg-purple-500 text-white";
      case "community":
        return "bg-orange-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500 text-white";
      case "ending-soon":
        return "bg-yellow-500 text-white";
      case "completed":
        return "bg-gray-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "ending-soon":
        return "Ending Soon";
      case "completed":
        return "Completed";
      default:
        return "Unknown";
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "staking":
        return <Coins className="w-3 h-3" />;
      case "social":
        return <Users className="w-3 h-3" />;
      case "trading":
        return <TrendingUp className="w-3 h-3" />;
      case "community":
        return <Trophy className="w-3 h-3" />;
      default:
        return <Trophy className="w-3 h-3" />;
    }
  };

  const handleAddStake = () => {
    setStakingMode("add-stake");
    setIsStakingModalOpen(true);
  };

  const handleReduceStake = () => {
    console.log("Reduce stake from pool:", pool.id);
    // Implementation for reducing stake
  };

  const handleViewOnExplorer = () => {
    console.log("View pool on blockchain explorer:", pool.id);
    // Implementation to open blockchain explorer
  };

  const daysRemaining = Math.ceil(
    (new Date(pool.endDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pool Details</h2>
            <p className="text-lg text-gray-600 mt-1">{pool.title}</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleShare}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors duration-200"
              title="Share pool"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Hero Section - Image and Stats Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Pool Image */}
              <div className="relative h-64">
                <div className="h-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gradient-to-br from-blue-50 to-purple-50">
                  {pool.imageUrl ? (
                    <img
                      src={pool.imageUrl}
                      alt={`${pool.title} pool`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <Trophy className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid - 2x2 with matching height */}
              <div className="h-64">
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Coins className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">
                        Your Stake
                      </span>
                    </div>
                    <div className="text-xl font-bold text-blue-900">
                      {parseFloat(fanStake).toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">
                      {pool.stakeCurrency}
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">
                        Earned
                      </span>
                    </div>
                    <div className="text-xl font-bold text-green-900">
                      {pool.earnedRewards}
                    </div>
                    <div className="text-xs text-green-600">
                      {pool.rewardCurrency}
                    </div>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">
                        Total Pool Stake
                      </span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">
                      {pool.totalReward.toLocaleString()}
                    </div>
                    <div className="text-xs text-purple-600">
                      {pool.stakeCurrency}
                    </div>
                  </div>

                  <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">
                        Total Fans
                      </span>
                    </div>
                    <div className="text-xl font-bold text-orange-900">
                      {pool.participants.toLocaleString()}
                    </div>
                    <div className="text-xs text-orange-600">supporters</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width Description */}
            <div className="mb-8">
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  About This Pool
                </h4>
                <div className="max-w-3xl">
                  <p className="text-base text-gray-700 leading-relaxed">
                    {pool.description}
                  </p>

                  {/* Take Rate */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Take Rate:
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {isReadingCreatorCut 
                          ? "Loading..." 
                          : contractCreatorCut !== undefined && contractCreatorCut !== null 
                            ? `${Number(contractCreatorCut) / 100}%` 
                            : "N/A"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Percentage of rewards taken by the pool creator
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="border-t border-gray-100 bg-white p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4">
            {/* Explorer Link */}
            <button
              onClick={handleViewOnExplorer}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors duration-200 text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>View on Explorer</span>
            </button>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleReduceStake}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors duration-200 shadow-sm"
              >
                <Minus className="w-4 h-4" />
                <span>Reduce Stake</span>
              </button>

              <button
                onClick={handleAddStake}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors duration-200 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Stake</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Staking Modal */}
      <StakingModal
        isOpen={isStakingModalOpen}
        onClose={() => setIsStakingModalOpen(false)}
        pool={
          pool
            ? {
                id: pool.id,
                title: pool.title,
                description: pool.description ?? "",
                stakeCurrency: pool.stakeCurrency,
                imageUrl: pool.imageUrl,
                minStake: 100,
                currentStake: parseFloat(fanStake),
              }
            : null
        }
        mode={stakingMode}
      />
    </div>
  );
}
