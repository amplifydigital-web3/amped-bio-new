import React, { useState, useEffect, useCallback } from "react";
import {
  Trophy,
  Users,
  Coins,
  TrendingUp,
  Crown,
  Star,
  Medal,
  Award,
  Eye,
  ChevronLeft,
  ChevronRight,
  Activity,
  ArrowUp,
  ArrowDown,
  Gift,
  Edit3,
  User,
  ListOrdered,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
} from "lucide-react";
import ExplorePoolDetailsModal from "../explore/ExplorePoolDetailsModal";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { CREATOR_POOL_ABI, getChainConfig } from "@ampedbio/web3";
import { Address, formatEther } from "viem";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { formatNumberWithSeparators } from "@/utils/numberUtils";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { RewardPool } from "@ampedbio/constants";
import { PoolDashboardSkeleton } from "./PoolDashboardSkeleton";

interface PoolActivity {
  id: string;
  type: "stake" | "unstake" | "claim";
  user: string;
  avatar: string | null;
  amount: number | string;
  timestamp: string;
  txHash?: string;
}

export default function DashboardPage() {
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] = useState(false);
  const [fansOrderBy, setFansOrderBy] = useState<"createdAt" | "stakeAmount">("createdAt");
  const [fansOrderDirection, setFansOrderDirection] = useState<"asc" | "desc">("desc");

  const fansPerPage = 10;
  const activitiesPerPage = 8;

  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);

  // Fetch pool data from backend
  const {
    data: poolData,
    isLoading: isPoolLoading,
    refetch: refetchPoolData,
  } = useQuery({
    queryKey: ["pools.getPool", chainId],
    queryFn: async () => {
      return await trpcClient.pools.creator.getPool.query({ chainId: chainId.toString() });
    },
    enabled: !!userAddress && !!chainId,
  });

  const { data: dashboardData, refetch: refetchDashboardData } = useQuery(
    trpc.pools.creator.getPoolDashboard.queryOptions(
      { chainId: poolData?.chainId as string },
      { enabled: !!poolData?.chainId }
    )
  );

  // Fetch paginated and sorted fans data
  const {
    data: fansData,
    isLoading: isFansLoading,
    refetch: refetchFansData,
  } = useQuery(
    trpc.pools.creator.getFans.queryOptions(
      {
        chainId: poolData?.chainId as string,
        pagination: {
          page: currentPage,
          pageSize: fansPerPage,
        },
        order: {
          orderBy: fansOrderBy,
          orderDirection: fansOrderDirection,
        },
      },
      {
        enabled: !!poolData?.chainId,
      }
    )
  );

  // Mutation for updating pool description
  const updateDescriptionMutation = useMutation({
    ...trpc.pools.creator.updateDescription.mutationOptions(),
  });

  // Get pool address from the backend data
  const poolAddress = poolData?.address as Address | undefined;

  // Set description input when pool data loads
  useEffect(() => {
    if (poolData?.description) {
      setDescriptionInput(poolData.description);
    }
  }, [poolData?.description]);

  // Refetch pool data after successful update to get the new description
  useEffect(() => {
    if (updateDescriptionMutation.isSuccess && !isEditingDescription) {
      refetchPoolData();
      refetchDashboardData();
      refetchFansData(); // Also refetch fans data
    }
  }, [
    updateDescriptionMutation.isSuccess,
    isEditingDescription,
    refetchPoolData,
    refetchDashboardData,
    refetchFansData,
  ]);

  const handleImageUploadClick = useCallback(() => {
    setIsImageUploadModalOpen(true);
  }, []);

  const handleImageUploadSuccess = React.useCallback(
    (fileId: number) => {
      // After successful upload, update the pool image in the database
      if (poolData?.id) {
        trpcClient.pools.creator.setImageForPool
          .mutate({
            id: poolData?.id,
            image_file_id: fileId,
          })
          .then(() => {
            refetchPoolData(); // Refetch pool data to show the new image
          })
          .catch(error => {
            console.error("Error setting pool image:", error);
            // Handle error (e.g., show a toast notification)
          });
      }
    },
    [poolData?.id, refetchPoolData]
  );

  // Fetch additional blockchain data for the pool
  const { data: poolName } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "poolName",
    query: {
      enabled: !!poolAddress,
    },
  });

  useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "creatorStaked",
    query: {
      enabled: !!poolAddress,
    },
  });

  useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "totalFanStaked",
    query: {
      enabled: !!poolAddress,
    },
  });

  useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "creatorCut",
    query: {
      enabled: !!poolAddress,
    },
  });

  const poolActivities: PoolActivity[] = React.useMemo(() => {
    return (
      dashboardData?.recentActivity?.map(activity => ({
        id: activity.id.toString(),
        type: activity.eventType as "stake" | "unstake" | "claim",
        user: activity.onelink || "",
        avatar: activity.avatar,
        amount: activity.amount,

        timestamp: activity.createdAt,
        txHash: activity.transactionHash || undefined,
      })) || []
    );
  }, [dashboardData?.recentActivity]);

  const fans = React.useMemo(() => fansData?.fans || [], [fansData]);

  // Calculate pagination
  const totalPages = React.useMemo(
    () => Math.ceil((fansData?.totalFans || 0) / fansPerPage),
    [fansData?.totalFans, fansPerPage]
  );
  const startIndex = React.useMemo(
    () => (currentPage - 1) * fansPerPage,
    [currentPage, fansPerPage]
  );
  const endIndex = React.useMemo(() => startIndex + fansPerPage, [startIndex, fansPerPage]);
  const currentFans = React.useMemo(
    () => fans.slice(startIndex, endIndex),
    [fans, startIndex, endIndex]
  );

  // Calculate history pagination
  const totalHistoryPages = React.useMemo(
    () => Math.ceil(poolActivities.length / activitiesPerPage),
    [poolActivities, activitiesPerPage]
  );
  const historyStartIndex = React.useMemo(
    () => (currentHistoryPage - 1) * activitiesPerPage,
    [currentHistoryPage, activitiesPerPage]
  );
  const historyEndIndex = React.useMemo(
    () => historyStartIndex + activitiesPerPage,
    [historyStartIndex, activitiesPerPage]
  );
  const currentActivities = React.useMemo(
    () => poolActivities.slice(historyStartIndex, historyEndIndex),
    [poolActivities, historyStartIndex, historyEndIndex]
  );

  const handlePreviousPage = React.useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextPage = React.useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const handlePageClick = React.useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handlePreviousHistoryPage = React.useCallback(() => {
    setCurrentHistoryPage(prev => Math.max(prev - 1, 1));
  }, []);

  const handleNextHistoryPage = React.useCallback(() => {
    setCurrentHistoryPage(prev => Math.min(prev + 1, totalHistoryPages));
  }, [totalHistoryPages]);

  const handleHistoryPageClick = React.useCallback((page: number) => {
    setCurrentHistoryPage(page);
  }, []);

  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  const formatValue = React.useCallback((value: number | string, currencySymbol: string) => {
    let displayValue: number;
    if (typeof value === "string") {
      try {
        displayValue = parseFloat(formatEther(BigInt(value)));
      } catch (e) {
        console.error("Error formatting value with formatEther:", e);
        displayValue = parseFloat(value) || 0;
      }
    } else {
      displayValue = value;
    }
    return `${formatNumberWithSeparators(displayValue)} ${currencySymbol}`;
  }, []);

  const getTierInfo = React.useCallback((tierLevel: number) => {
    const tiers = [
      {
        level: 1,
        name: "Bronze Tier",
        gradient: "bg-gradient-to-r from-amber-500 to-orange-600",
        textColor: "text-white",
        icon: "🥉",
      },
      {
        level: 2,
        name: "Silver Tier",
        gradient: "bg-gradient-to-r from-gray-300 to-gray-500",
        textColor: "text-gray-900",
        icon: "🥈",
      },
      {
        level: 3,
        name: "Gold Tier",
        gradient: "bg-gradient-to-r from-yellow-400 to-yellow-600",
        textColor: "text-gray-900",
        icon: "🥇",
      },
      {
        level: 4,
        name: "Diamond Tier",
        gradient: "bg-gradient-to-r from-blue-400 to-purple-600",
        textColor: "text-white",
        icon: "💎",
      },
    ];
    return tiers.find(t => t.level === tierLevel) || tiers[0];
  }, []);

  const getRankIcon = React.useCallback((index: number) => {
    switch (index) {
      case 0:
        return <Crown className="w-5 h-5 text-yellow-500" />;
      case 1:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 2:
        return <Award className="w-5 h-5 text-orange-500" />;
      default:
        return <Star className="w-4 h-4 text-gray-400" />;
    }
  }, []);

  const getActivityIcon = React.useCallback((type: string) => {
    switch (type) {
      case "stake":
        return <ArrowUp className="w-4 h-4 text-green-600" />;
      case "unstake":
        return <ArrowDown className="w-4 h-4 text-red-600" />;
      case "claim":
        return <Gift className="w-4 h-4 text-blue-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  }, []);

  const getActivityColor = React.useCallback((type: string) => {
    switch (type) {
      case "stake":
        return "bg-green-50 border-green-200";
      case "unstake":
        return "bg-red-50 border-red-200";
      case "claim":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  }, []);

  const getActivityText = React.useCallback((type: string) => {
    switch (type) {
      case "stake":
        return "Staked";
      case "unstake":
        return "Unstaked";
      case "claim":
        return "Claimed";
      default:
        return "Activity";
    }
  }, []);

  const formatTimeAgo = React.useCallback((timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return activityTime.toLocaleDateString();
  }, []);

  // const stakeData = React.useMemo(() => {
  //   return (
  //     dashboardData?.dailyStakeData?.map(d => ({
  //       date: d.date,
  //       stake: d.stake,
  //     })) || []
  //   );
  // }, [dashboardData?.dailyStakeData]);

  // // Combine the data for the chart
  // const chartData = React.useMemo(
  //   () =>
  //     stakeData.map(stake => ({
  //       date: stake.date,
  //       stake: stake.stake,
  //     })),
  //   [stakeData]
  // );

  // Get pool details combining backend and blockchain data
  const userPool = React.useMemo<RewardPool | null>(() => {
    if (!poolData) {
      return null;
    }

    // If dashboardData is not available yet, create a partial userPool with basic data
    if (!dashboardData) {
      return {
        id: poolData.id,
        name: poolName || poolData.description || "Pool Name",
        description: poolData.description || "Pool description not available",
        image: poolData.image, // Use image object for the modal
        chainId: poolData.chainId,
        address: poolData.address!, // Add pool address for the new modal (non-nullable)
        stakedAmount: 0n, // User's own stake in their pool (0 since it's their pool) as bigint
        fans: 0, // Default to 0 until dashboardData is available
        // TODO check if this value is required
        totalReward: BigInt(poolData.totalReward) || 0n, // Using totalReward from the updated server response
        // TODO check if this value is required
        pendingRewards: 0n,
        stakedByYou: poolData.stakedByYou || 0n, // Using stakedByYou from the updated server response
        creator: {
          userId: poolData.creator.userId,
          address: "0x0000000000000000000000000000000000000000", // Default address when not available
        }, // Add creator object
      };
    }

    // Keep values in wei
    const totalStake = dashboardData.totalStake;

    return {
      id: poolData.id,
      name: poolName || poolData.description || "Pool Name",
      description: poolData.description || "Pool description not available",
      image: poolData.image, // Use image object for the modal
      chainId: poolData.chainId,
      address: poolData.address!, // Add pool address for the new modal (non-nullable)
      stakedAmount: 0n, // User's own stake in their pool (0 since it's their pool) as bigint
      fans: dashboardData.totalFans, // Using totalFans from dashboardData
      // TODO check if this value is required
      totalReward: BigInt(poolData.totalReward) || 0n, // Using totalReward from the updated server response
      // TODO check if this value is required
      pendingRewards: 0n,
      stakedByYou: poolData.stakedByYou || 0n, // Using stakedByYou from the updated server response
      creator: {
        userId: poolData.creator.userId,
        address: "0x0000000000000000000000000000000000000000", // Default address when not available
      }, // Add creator object
    };
  }, [poolData, poolName, dashboardData]);

  // Create line chart path
  // const createChartElements = React.useCallback(() => {
  //   const chartWidth = 900;
  //   const chartHeight = 400;
  //   const padding = { top: 40, right: 60, bottom: 80, left: 80 };
  //   const plotWidth = chartWidth - padding.left - padding.right;
  //   const plotHeight = chartHeight - padding.top - padding.bottom;

  //   // Check if chartData is empty to prevent errors
  //   if (chartData.length === 0) {
  //     return {
  //       stakePoints: [],
  //       stakePathData: "",
  //       leftYLabels: [],
  //       xLabels: [],
  //       chartWidth,
  //       chartHeight,
  //       padding,
  //     };
  //   }

  //   const maxStake = Math.max(...chartData.map(d => parseFloat(formatEther(BigInt(d.stake)))));
  //   const stakeRange = maxStake; // If minStake is 0, range is just maxStake

  //   // Handle case where all values are the same (stakeRange is 0)
  //   const effectiveStakeRange = stakeRange === 0 ? 1 : stakeRange;

  //   // Create points for the stake line
  //   const stakePoints = chartData.map((point, index) => {
  //     // Handle division by zero when there's only one data point
  //     const xFactor = chartData.length > 1 ? index / (chartData.length - 1) : 0.5;
  //     const x = padding.left + 20 + xFactor * (plotWidth - 40);

  //     const stakeValue = parseFloat(formatEther(BigInt(point.stake)));
  //     // Use effectiveStakeRange to prevent division by zero
  //     const y = padding.top + plotHeight - (stakeValue / effectiveStakeRange) * plotHeight;

  //     return {
  //       x: isNaN(x) ? padding.left + 20 : x,
  //       y: isNaN(y) ? padding.top + plotHeight : y,
  //       value: stakeValue,
  //       date: point.date,
  //     };
  //   });

  //   // Create SVG path for stake line
  //   const stakePathData = stakePoints
  //     .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
  //     .join(" ");

  //   // Create left Y-axis labels (Total Stake) - 5 evenly spaced labels
  //   const leftYLabels: { value: number; y: number }[] = [];
  //   const labelCount = 5;
  //   for (let i = 0; i < labelCount; i++) {
  //     // Handle division by zero when there's only one label
  //     const denominator = labelCount - 1 > 0 ? labelCount - 1 : 1;
  //     const value = (stakeRange * i) / denominator;
  //     const yFactor = labelCount - 1 > 0 ? i / (labelCount - 1) : 0.5;
  //     const y = padding.top + plotHeight - yFactor * plotHeight;

  //     leftYLabels.push({
  //       value,
  //       y: isNaN(y) ? padding.top + plotHeight / 2 : y,
  //     });
  //   }

  //   // Create X-axis labels (show every 5th day for cleaner look)
  //   const xLabels: { x: number; label: string; date: string }[] = chartData
  //     .filter((_, index) => index % 5 === 0 || index === chartData.length - 1)
  //     .map((point, _) => {
  //       const originalIndex = chartData.indexOf(point);
  //       // Handle division by zero when there's only one data point
  //       const xFactor = chartData.length > 1 ? originalIndex / (chartData.length - 1) : 0.5;
  //       const x = padding.left + 20 + xFactor * (plotWidth - 40);

  //       return {
  //         x: isNaN(x) ? padding.left + 20 : x,
  //         label: new Date(point.date).toLocaleDateString("en-US", {
  //           month: "short",
  //           day: "numeric",
  //         }),
  //         date: point.date,
  //       };
  //     });

  //   return {
  //     stakePoints,
  //     stakePathData,
  //     leftYLabels,
  //     xLabels,
  //     chartWidth,
  //     chartHeight,
  //     padding,
  //   };
  // }, [chartData]);

  // const chartElements = React.useMemo(() => createChartElements(), [createChartElements]);

  const handleViewPool = React.useCallback(() => {
    setIsPoolModalOpen(true);
  }, []);

  // Handle description update
  const handleUpdateDescription = async () => {
    if (!chainId || !descriptionInput.trim()) return;

    try {
      await updateDescriptionMutation.mutateAsync({
        chainId: chainId.toString(),
        description: descriptionInput.trim(),
      });

      // Exit edit mode after successful update
      setIsEditingDescription(false);
    } catch (error) {
      console.error("Error updating description:", error);
      // In a real app, you'd show an error message to the user
      alert("Failed to update description. Please try again.");
    }
  };

  const handleEditDescription = () => {
    if (poolData?.description) {
      setDescriptionInput(poolData.description);
    }
    setIsEditingDescription(true);
  };

  const handleCancelEdit = () => {
    // Revert to original description
    if (poolData?.description) {
      setDescriptionInput(poolData.description);
    }
    setIsEditingDescription(false);
  };

  // Show loading state while fetching pool data or dashboard data
  if (!userAddress || !chainId || isPoolLoading || !poolData || !dashboardData) {
    return <PoolDashboardSkeleton />;
  }

  // If no pool data is available after loading, show an error message
  if (!poolData) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex justify-center items-center h-64">
        <div className="text-center">
          <p className="text-gray-600">No pool data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pool Dashboard</h1>
          <p className="text-gray-600">Manage and monitor your reward pool performance</p>
        </div>
      </div>

      {/* Pool Overview */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pool Image */}
          <div className="relative h-64 group">
            {userPool?.image ? (
              <div className="h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                <img
                  src={userPool.image.url}
                  alt={`${userPool.name} pool`}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className="h-full rounded-xl border border-gray-200 shadow-sm flex items-center justify-center bg-gray-50 cursor-pointer"
                onClick={handleImageUploadClick}
              >
                <div className="text-center text-gray-500">
                  <Edit3 className="w-12 h-12 mx-auto mb-2" />
                  <p className="text-sm font-medium">Upload Pool Image</p>
                </div>
              </div>
            )}
            <button
              onClick={handleImageUploadClick}
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
              title="Change Pool Image"
            >
              <Edit3 className="w-8 h-8 text-white" />
            </button>
          </div>

          {/* Pool Info */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {userPool?.name || "Pool Name"}
              </h2>
              {isEditingDescription ? (
                <div className="space-y-3">
                  <textarea
                    value={descriptionInput}
                    onChange={e => setDescriptionInput(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]"
                    placeholder="Enter pool description..."
                    maxLength={500}
                  />
                  <div className="text-sm text-gray-500 text-right">
                    {descriptionInput.length}/500 characters
                  </div>
                  <div className="flex space-x-3 pt-2">
                    <button
                      onClick={handleUpdateDescription}
                      disabled={updateDescriptionMutation.isPending}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 disabled:opacity-50 flex items-center"
                    >
                      {updateDescriptionMutation.isPending && (
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
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
                      )}
                      {updateDescriptionMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={updateDescriptionMutation.isPending}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors duration-200 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-gray-600 leading-relaxed">
                    {userPool?.description || "Pool description"}
                  </p>
                  <button
                    onClick={handleEditDescription}
                    className="mt-3 inline-flex items-center space-x-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors duration-200"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Description</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Pool Button */}
            <div>
              <button
                onClick={handleViewPool}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 shadow-sm"
              >
                <Eye className="w-5 h-5" />
                <span>View Pool Details</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Stake */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Coins className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Total Stake</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">
              {userPool ? formatEther(BigInt(userPool.totalReward)) : "0"}
            </p>
            <p className="text-sm text-green-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              {dashboardData?.totalStakePercentageChange?.toFixed(2) || "0.00"}% this month
            </p>
          </div>
        </div>

        {/* Total Rewards */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 opacity-50 cursor-not-allowed">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Total Rewards</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-400">0</p>
            <p className="text-sm text-gray-400 flex items-center">Soon</p>
          </div>
        </div>

        {/* Total Fans */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">Total Fans</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">
              {userPool ? formatNumberWithSeparators(userPool.fans) : "0"}
            </p>
            <p className="text-sm text-purple-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />+{dashboardData?.newFansThisWeek} new this week
            </p>
          </div>
        </div>
      </div>

      {/* Chart Section - HIDDEN by commenting out */}
      {/*
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Pool Performance</h3>
            <p className="text-sm text-gray-600">Track your pool's growth over time</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Total Stake</span>
            </div>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <div className="min-w-[800px]">
            <svg
              width={chartElements.chartWidth}
              height={chartElements.chartHeight}
              className="w-full h-auto bg-white rounded-lg border border-gray-200"
              viewBox={`0 0 ${chartElements.chartWidth} ${chartElements.chartHeight}`}
            >
              <defs>
                <pattern id="grid" width="50" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 40" fill="none" stroke="#f8fafc" strokeWidth="1" />
                </pattern>
              </defs>

              <rect
                x={chartElements.padding.left + 10}
                y={chartElements.padding.top}
                width={
                  chartElements.chartWidth -
                  chartElements.padding.left -
                  chartElements.padding.right -
                  20
                }
                height={
                  chartElements.chartHeight -
                  chartElements.padding.top -
                  chartElements.padding.bottom
                }
                fill="#fafafa"
                stroke="#e2e8f0"
                strokeWidth="1"
              />

              {chartElements.leftYLabels?.map((label, index) => (
                <line
                  key={`grid-h-${index}`}
                  x1={chartElements.padding.left + 10}
                  y1={isNaN(label.y) ? 0 : label.y}
                  x2={chartElements.chartWidth - chartElements.padding.right - 10}
                  y2={isNaN(label.y) ? 0 : label.y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              ))}

              {chartElements.leftYLabels?.map((label, index) => (
                <g key={`left-label-${index}`}>
                  <text
                    x={chartElements.padding.left - 25}
                    y={isNaN(label.y) ? 0 : label.y + 4}
                    textAnchor="end"
                    className="text-xs fill-green-700 font-medium"
                  >
                    {label.value >= 1000
                      ? `${(label.value / 1000).toFixed(1)}k`
                      : Math.round(label.value).toLocaleString()}
                  </text>
                </g>
              ))}

              {chartElements.xLabels?.map((label, index) => (
                <g key={`x-label-${index}`}>
                  <text
                    x={isNaN(label.x) ? 0 : label.x}
                    y={chartElements.chartHeight - chartElements.padding.bottom + 30}
                    textAnchor="middle"
                    className="text-xs fill-gray-700 font-medium"
                  >
                    {label.label}
                  </text>
                </g>
              ))}

              <path
                d={chartElements.stakePathData}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {chartElements.stakePoints?.map((point, index) => (
                <circle
                  key={`stake-point-${index}`}
                  cx={isNaN(point.x) ? 0 : point.x}
                  cy={isNaN(point.y) ? 0 : point.y}
                  r="3.5"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="1.5"
                  className="hover:fill-green-600 cursor-pointer transition-all duration-200"
                >
                  <title>{`${new Date(point.date).toLocaleDateString()}: ${Math.round(point.value).toLocaleString()} REVO Total Stake`}</title>
                </circle>
              ))}

              <line
                x1={chartElements.padding.left}
                y1={chartElements.chartHeight - chartElements.padding.bottom}
                x2={chartElements.chartWidth - chartElements.padding.right}
                y2={chartElements.chartHeight - chartElements.padding.bottom}
                stroke="#374151"
                strokeWidth="1.5"
              />
              <line
                x1={chartElements.padding.left}
                y1={chartElements.padding.top}
                x2={chartElements.padding.left}
                y2={chartElements.chartHeight - chartElements.padding.bottom}
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <line
                x1={chartElements.chartWidth - chartElements.padding.right}
                y1={chartElements.padding.top}
                x2={chartElements.chartWidth - chartElements.padding.right}
                y2={chartElements.chartHeight - chartElements.padding.bottom}
                stroke="#3b82f6"
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>
      </div>
      */}

      {/* Fan Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Top Fans</h3>
            <p className="text-sm text-gray-600">Your most dedicated supporters</p>
          </div>
          <div className="flex space-x-4">
            {/* Order By */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Order by:</span>
              <button
                onClick={() => setFansOrderBy("createdAt")}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  fansOrderBy === "createdAt"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Date
              </button>
              <button
                onClick={() => setFansOrderBy("stakeAmount")}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  fansOrderBy === "stakeAmount"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                Stake Amount
              </button>
            </div>

            {/* Order Direction */}
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-700">Direction:</span>
              <button
                onClick={() => setFansOrderDirection("asc")}
                className={`p-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  fansOrderDirection === "asc"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <ArrowUpNarrowWide className="w-4 h-4" />
              </button>
              <button
                onClick={() => setFansOrderDirection("desc")}
                className={`p-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  fansOrderDirection === "desc"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <ArrowDownWideNarrow className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {currentFans.map((fan, index) => {
            const globalIndex = startIndex + index;
            const tierInfo = getTierInfo(1);

            return (
              <div
                key={fan.onelink}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-500 w-6">
                      #{globalIndex + 1}
                    </span>
                    {getRankIcon(globalIndex)}
                  </div>

                  {fan.avatar ? (
                    <img
                      src={fan.avatar}
                      alt={fan.onelink}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center border-2 border-white shadow-sm">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                  )}

                  <div>
                    <p className="font-medium text-gray-900">{fan.onelink}</p>
                    <p className="text-sm text-gray-500">Joined recently</p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      {formatValue(fan.stakeAmount, currencySymbol)}
                    </p>
                    <p className="text-sm text-gray-500">Staked</p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatValue(0, currencySymbol)}</p>
                    <p className="text-sm text-gray-500">Rewards</p>
                  </div>

                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${tierInfo.gradient} ${tierInfo.textColor}`}
                  >
                    {tierInfo.icon} {tierInfo.name}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1}-{Math.min(endIndex, fansData?.totalFans || 0)} of{" "}
              {fansData?.totalFans || 0} fans
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageClick(pageNum)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        currentPage === pageNum
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pool Activity History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-sm text-gray-600">Latest pool transactions and events</p>
          </div>
        </div>

        <div className="space-y-3">
          {currentActivities.map(activity => (
            <div
              key={activity.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${getActivityColor(activity.type)} transition-colors duration-200`}
            >
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  {getActivityIcon(activity.type)}
                  <span className="text-sm font-medium text-gray-900">
                    {getActivityText(activity.type)}
                  </span>
                </div>

                {activity.avatar ? (
                  <img
                    src={activity.avatar}
                    alt={activity.user}
                    className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center border border-white shadow-sm">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                )}

                <div>
                  <p className="font-medium text-gray-900">{activity.user}</p>
                  <p className="text-sm text-gray-500">{formatTimeAgo(activity.timestamp)}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {formatValue(activity.amount, currencySymbol)}
                </p>
                {activity.txHash && (
                  <p className="text-xs text-gray-500 font-mono">{activity.txHash}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Activity Pagination */}
        {totalHistoryPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Showing {historyStartIndex + 1}-{Math.min(historyEndIndex, poolActivities.length)} of{" "}
              {poolActivities.length} activities
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousHistoryPage}
                disabled={currentHistoryPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalHistoryPages) }, (_, i) => {
                  let pageNum;
                  if (totalHistoryPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentHistoryPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentHistoryPage >= totalHistoryPages - 2) {
                    pageNum = totalHistoryPages - 4 + i;
                  } else {
                    pageNum = currentHistoryPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handleHistoryPageClick(pageNum)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        currentHistoryPage === pageNum
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNextHistoryPage}
                disabled={currentHistoryPage === totalHistoryPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pool Details Modal */}
      {isPoolModalOpen && userPool && (
        <ExplorePoolDetailsModal
          poolId={userPool.id}
          isOpen={isPoolModalOpen}
          onClose={() => setIsPoolModalOpen(false)}
        />
      )}

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageUploadModalOpen}
        onClose={() => setIsImageUploadModalOpen(false)}
        onUploadSuccess={handleImageUploadSuccess}
        currentImageUrl={userPool?.image?.url ?? undefined}
      />
    </div>
  );
}
