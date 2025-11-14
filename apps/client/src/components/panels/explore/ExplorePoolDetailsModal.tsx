import React, { useState, useCallback } from "react";
import {
  X,
  Trophy,
  Users,
  Coins,
  ExternalLink,
  Plus,
  Minus,
  Share2,
  Gift,
  Edit3,
} from "lucide-react";
import { toast } from "react-hot-toast";
import StakingModal from "./StakingModal";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { useAccount } from "wagmi";
import { trpcClient } from "@/utils/trpc";
import { usePoolReader } from "../../../hooks/usePoolReader";
import { useStaking } from "../../../hooks/useStaking";
import { formatEther } from "viem";

import { RewardPool } from "@ampedbio/constants";

interface ExplorePoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: RewardPool;
}

export default function ExplorePoolDetailsModal({
  isOpen,
  onClose,
  pool,
}: ExplorePoolDetailsModalProps) {
  const { creatorCut: contractCreatorCut, isReadingCreatorCut } = usePoolReader(
    pool?.poolAddress as `0x${string}` | undefined
  );
  const {
    fanStake,
    isStaking,
    stakeActionError,
    stake,
    unstake,
    currencySymbol,
    pendingReward,
    isReadingPendingReward,
    claimReward,
    refetchFanStake,
    refetchPendingReward,
  } = useStaking(pool);

  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake" | "reduce-stake">("stake");
  const [isClaiming, setIsClaiming] = useState(false);

  const { address: userAddress } = useAccount();

  const handleImageUploadClick = useCallback(() => {
    setIsImageUploadModalOpen(true);
  }, []);

  const handleImageUploadSuccess = useCallback(
    (fileId: number) => {
      if (pool?.id) {
        trpcClient.pools.creator.setImageForPool
          .mutate({
            id: pool.id,
            image_file_id: fileId,
          })
          .then(() => {
            // Optionally, refetch pool data to show the new image
            // This would require adding a refetch function to the pool data fetching logic
            console.log("Pool image updated successfully!");
          })
          .catch(error => {
            console.error("Error setting pool image:", error);
          });
      }
    },
    [pool?.id]
  );

  if (!isOpen || !pool || !pool.poolAddress) return null;

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
          title: pool.name,
          text: `Check out this reward pool: ${pool.name}`,
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

  const handleClaimReward = async () => {
    if (isClaiming) return; // Prevent multiple clicks

    setIsClaiming(true);
    try {
      await claimReward();
      // Manually refetch the fan stake and pending reward after successful claim
      await refetchFanStake();
      await refetchPendingReward();

      // Show success toast
      toast.success(
        `Rewards claimed successfully! Your wallet has been updated with ${formatEther(pendingReward || BigInt(0))} ${currencySymbol}`
      );
      console.log("Rewards claimed successfully!");
    } catch (error) {
      console.error("Failed to claim rewards:", error);
      // Show error toast
      toast.error("Failed to claim rewards. Please try again.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleViewOnExplorer = () => {
    console.log("View pool on blockchain explorer:", pool.id);
    // Implementation to open blockchain explorer
  };

  const handleAddStake = () => {
    setStakingMode("add-stake");
    setIsStakingModalOpen(true);
  };

  const handleReduceStake = () => {
    setStakingMode("reduce-stake");
    setIsStakingModalOpen(true);
  };

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
            <p className="text-lg text-gray-600 mt-1">{pool.name}</p>
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
              <div className="relative h-64 group">
                <div className="h-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gradient-to-br from-blue-50 to-purple-50">
                  {pool.imageUrl ? (
                    <img
                      src={pool.imageUrl}
                      alt={`${pool.name} pool`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <Trophy className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>
                {userAddress === pool.creatorAddress && (
                  <button
                    onClick={handleImageUploadClick}
                    className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                    title="Change Pool Image"
                  >
                    <Edit3 className="w-8 h-8 text-white" />
                  </button>
                )}
              </div>

              {/* Stats Grid - 2x2 with matching height */}
              <div className="h-64">
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Coins className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Your Stake</span>
                    </div>
                    <div className="text-xl font-bold text-blue-900">
                      {parseFloat(fanStake).toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">{currencySymbol}</div>
                  </div>

                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Gift className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-700">Pending Rewards</span>
                    </div>
                    <div className="text-xl font-bold text-yellow-900">
                      {isReadingPendingReward
                        ? "Loading..."
                        : pendingReward !== undefined && pendingReward !== null
                          ? parseFloat(formatEther(pendingReward)).toLocaleString()
                          : "0"}
                    </div>
                    <div className="text-xs text-yellow-600">{currencySymbol}</div>
                    <button
                      onClick={handleClaimReward}
                      className="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-medium transition-colors duration-200 disabled:opacity-50 flex items-center justify-center"
                      disabled={
                        isReadingPendingReward ||
                        !pendingReward ||
                        pendingReward === BigInt(0) ||
                        isClaiming
                      }
                    >
                      {isClaiming ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-2 h-3 w-3 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                          Claiming...
                        </>
                      ) : (
                        "Claim"
                      )}
                    </button>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Total Pool Stake</span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">
                      {pool.totalReward.toLocaleString()}
                    </div>
                    <div className="text-xs text-purple-600">{currencySymbol}</div>
                  </div>

                  <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">Total Fans</span>
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
                <h4 className="text-lg font-semibold text-gray-900 mb-4">About This Pool</h4>
                <div className="max-w-3xl">
                  <p className="text-base text-gray-700 leading-relaxed">{pool.description}</p>

                  {/* Take Rate */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Take Rate:</span>
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

            {/* Stake Action Error Message */}
            {stakeActionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{stakeActionError}</p>
              </div>
            )}
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
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors duration-200 shadow-sm disabled:opacity-50"
                disabled={isStaking}
              >
                <Minus className="w-4 h-4" />
                <span>{isStaking ? "Processing..." : "Reduce Stake"}</span>
              </button>

              <button
                onClick={handleAddStake}
                className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors duration-200 shadow-sm disabled:opacity-50"
                disabled={isStaking}
              >
                <Plus className="w-4 h-4" />
                <span>{isStaking ? "Processing..." : "Add Stake"}</span>
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
                name: pool.name,
                description: pool.description ?? "",
                chainId: pool.chainId,
                imageUrl: pool.imageUrl,
                currentStake: parseFloat(fanStake),
              }
            : null
        }
        mode={stakingMode}
        onStake={stake}
        onUnstake={unstake}
        isStaking={isStaking}
        stakeActionError={stakeActionError}
      />

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageUploadModalOpen}
        onClose={() => setIsImageUploadModalOpen(false)}
        onUploadSuccess={handleImageUploadSuccess}
        currentImageUrl={pool.imageUrl ?? undefined}
      />
    </div>
  );
}
