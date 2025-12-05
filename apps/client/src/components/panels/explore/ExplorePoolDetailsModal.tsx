import React, { useState, useCallback } from "react";
import { Trophy, Users, Coins, ExternalLink, Plus, Minus, Share2, Gift, Edit3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "react-hot-toast";
import StakeModal from "./StakeModal";
import UnstakeModal from "./UnstakeModal";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { useAccount } from "wagmi";
import { trpcClient } from "@/utils/trpc";
import { trpc } from "@/utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";
import { usePoolReader } from "../../../hooks/usePoolReader";
import { formatEther } from "viem";
import { getChainConfig } from "@ampedbio/web3";

import PoolDetailsModalSkeleton from "./PoolDetailsModalSkeleton";
import { formatOnelink } from "@/utils/onelink";

interface ExplorePoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolId?: number; // Optional - used when opening from list view
  poolAddress?: string; // Optional - used when opening from URL parameter
  onStakeSuccess?: () => void; // Callback for when stake/unstake succeeds to trigger refresh
}

export default function ExplorePoolDetailsModal({
  isOpen,
  onClose,
  poolId,
  poolAddress,
  onStakeSuccess,
}: ExplorePoolDetailsModalProps) {
  // Query for pool by either ID or address (the endpoint accepts both)
  const {
    data: pool,
    isLoading,
    isError,
    refetch: refetchPoolData,
  } = useQuery({
    ...trpc.pools.fan.getPoolDetailsForModal.queryOptions({
      poolId: poolId || undefined,
      poolAddress: poolAddress || undefined
    }),
    enabled: isOpen && (!!poolId || !!poolAddress), // Only run if we have either poolId or poolAddress
    staleTime: 1000 * 60, // Cache for 1 minute
  });

  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const [isUnstakeModalOpen, setIsUnstakeModalOpen] = useState(false);
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">("stake");
  const [isClaiming, setIsClaiming] = useState(false);

  const { address: userAddress } = useAccount();

  const {
    creatorCut: contractCreatorCut,
    fanStake: rawFanStake,
    pendingReward,
    isReadingPendingReward,
    fetchAllData,
    claimReward,
  } = usePoolReader(
    pool?.address as `0x${string}` | undefined,
    userAddress as `0x${string}` | undefined,
    {
      initialFanStake: pool?.stakedByYou,
      initialPendingReward: pool?.pendingRewards,
    }
  );

  const chainConfig = getChainConfig(parseInt(pool?.chainId || "0"));
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  // Format the raw fan stake (bigint) to a string for display
  const fanStake = rawFanStake ? formatEther(rawFanStake) : "0";

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

  // Show loading state when fetching by poolId or poolAddress
  if (isLoading || isError) {
    if (isLoading) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
            <PoolDetailsModalSkeleton />
          </DialogContent>
        </Dialog>
      );
    }

    if (isError) {
      return (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-4xl">
            <div className="flex justify-center items-center h-64">
              <p className="text-red-500">Error loading pool details</p>
            </div>
          </DialogContent>
        </Dialog>
      );
    }

    return null;
  }

  if (!isOpen || (!poolId && !poolAddress) || !pool?.address) return null;

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
      // Refetch all pool data after successful claim
      await fetchAllData();

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
    const chain = getChainConfig(Number(pool.chainId));
    if (chain && chain.blockExplorers?.default?.url && pool.address) {
      const explorerUrl = `${chain.blockExplorers.default.url}/address/${pool.address}`;
      window.open(explorerUrl, "_blank");
    } else {
      toast.error("Could not find explorer URL for this chain.");
    }
  };

  const handleAddStake = () => {
    setStakingMode("add-stake");
    setIsStakeModalOpen(true);
  };

  const handleReduceStake = () => {
    setIsUnstakeModalOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl font-bold text-gray-900">Pool Details</DialogTitle>
                <p className="text-lg text-gray-600 mt-1">{pool.name}</p>
                {pool.creator.littlelink && (
                  <p className="text-sm text-gray-500 mt-1">
                    Created by <a
                      href={`/${formatOnelink(pool.creator.littlelink)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {formatOnelink(pool.creator.littlelink)}
                    </a>
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleShare}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors duration-200"
                  title="Share pool"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* Dialog Content - Scrollable */}
          <div className="p-6 flex-1 overflow-y-auto">
            {/* Hero Section - Image and Stats Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Pool Image */}
              <div className="relative h-64 group">
                <div className="h-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                  {pool.image ? (
                    <img
                      src={pool.image.url}
                      alt={`${pool.name} pool`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <Trophy className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>
                {userAddress === pool.creator.address && (
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
                  <div className="rounded-xl p-4 border border-blue-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Coins className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Your Stake</span>
                    </div>
                    <div className="text-xl font-bold text-blue-900">
                      {parseFloat(fanStake).toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">{currencySymbol}</div>
                  </div>

                  <div className="rounded-xl p-4 border border-yellow-100 flex flex-col justify-center">
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

                  <div className="rounded-xl p-4 border border-purple-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Total Pool Stake</span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">
                      {parseFloat(formatEther(BigInt(pool.totalReward))).toFixed(8)}
                    </div>
                    <div className="text-xs text-purple-600">{currencySymbol}</div>
                  </div>

                  <div className="rounded-xl p-4 border border-orange-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">Total Fans</span>
                    </div>
                    <div className="text-xl font-bold text-orange-900">
                      {pool.fans.toLocaleString()}
                    </div>
                    <div className="text-xs text-orange-600">supporters</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width Description */}
            <div className="mb-8">
              <div className="rounded-xl p-6 border border-gray-100">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">About This Pool</h4>
                <div className="max-w-3xl">
                  <p className="text-base text-gray-700 leading-relaxed">{pool.description}</p>

                  {/* Take Rate */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Take Rate:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {contractCreatorCut !== undefined && contractCreatorCut !== null
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
          <DialogFooter className="border-t border-gray-100 p-6">
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
                  disabled={parseFloat(fanStake) <= 0}
                  title={parseFloat(fanStake) <= 0 ? "You have no stake in this pool" : undefined}
                >
                  <Minus className="w-4 h-4" />
                  <span>{parseFloat(fanStake) <= 0 ? "No Stake" : "Reduce Stake"}</span>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Staking Modals */}
      <StakeModal
        isOpen={isStakeModalOpen}
        onClose={() => setIsStakeModalOpen(false)}
        pool={
          pool
            ? {
                id: pool.id,
                name: pool.name,
                description: pool.description ?? "",
                chainId: pool.chainId,
                address: pool.address,
                image: pool.image,
                currentStake: parseFloat(fanStake),
              }
            : null
        }
        mode={stakingMode}
        onStakeSuccess={async () => {
          // When stake operations complete, refetch blockchain data using multicall
          await fetchAllData();

          // Refetch pool data to update fans count and other pool details
          await refetchPoolData();

          // Call the original callback if provided
          onStakeSuccess?.();
        }}
      />

      <UnstakeModal
        isOpen={isUnstakeModalOpen}
        onClose={() => setIsUnstakeModalOpen(false)}
        pool={
          pool
            ? {
                id: pool.id,
                name: pool.name,
                description: pool.description ?? "",
                chainId: pool.chainId,
                address: pool.address,
                image: pool.image,
                currentStake: parseFloat(fanStake),
              }
            : null
        }
        onStakeSuccess={async () => {
          // When stake operations complete, refetch blockchain data using multicall
          await fetchAllData();

          // Refetch pool data to update fans count and other pool details
          await refetchPoolData();

          // Call the original callback if provided
          onStakeSuccess?.();
        }}
      />

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageUploadModalOpen}
        onClose={() => setIsImageUploadModalOpen(false)}
        onUploadSuccess={handleImageUploadSuccess}
        currentImageUrl={pool.image?.url ?? undefined}
      />
    </>
  );
}
