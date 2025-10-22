import React, { useState, useEffect } from "react";
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
  Clock,
  Edit3,
} from "lucide-react";
import PoolDetailsModal from "../wallet/PoolDetailsModal";
import { trpc } from "@/utils/trpc";
import { useMutation } from "@tanstack/react-query";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { CREATOR_POOL_ABI, getChainConfig } from "@ampedbio/web3";
import { Address } from "viem";
import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "@/utils/trpc";
import { ImageUploadModal } from "@/components/ImageUploadModal";

interface Fan {
  id: string;
  username: string;
  avatar: string;
  stakedAmount: number;
  joinDate: string;
  tier: number;
  totalRewards: number;
}

interface PoolActivity {
  id: string;
  type: "stake" | "unstake" | "claim";
  user: string;
  avatar: string;
  amount: number;
  currency: string;
  timestamp: string;
  txHash?: string;
}

export default function DashboardPage() {
  const [showUSD, setShowUSD] = useState(false);
  const [isPoolModalOpen, setIsPoolModalOpen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const [isImageUploadModalOpen, setIsImageUploadModalOpen] = useState(false);
  const fansPerPage = 10;
  const activitiesPerPage = 8;
  const revoToUSD = 0.25;

  const { address: userAddress } = useAccount();
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);

  // Fetch pool data from backend
  const {
    data: poolData,
    isLoading: isPoolLoading,
    refetch,
  } = useQuery({
    queryKey: ["pools.getPool", chainId],
    queryFn: async () => {
      return await trpcClient.pools.getPool.query({ chainId: chainId.toString() });
    },
    enabled: !!userAddress && !!chainId,
  });

  // Mutation for updating pool description
  const updateDescriptionMutation = useMutation({
    ...trpc.pools.updateDescription.mutationOptions(),
  });

  // Get pool address from the backend data
  const poolAddress = poolData?.poolAddress as Address | undefined;

  // Set description input when pool data loads
  useEffect(() => {
    if (poolData?.description) {
      setDescriptionInput(poolData.description);
    }
  }, [poolData?.description]);

  // Refetch pool data after successful update to get the new description
  useEffect(() => {
    if (updateDescriptionMutation.isSuccess && !isEditingDescription) {
      // Refetch the query to update the UI with new description
      refetch();
    }
  }, [updateDescriptionMutation.isSuccess, isEditingDescription, refetch]);

  const handleImageUploadClick = React.useCallback(() => {
    setIsImageUploadModalOpen(true);
  }, []);

  const handleImageUploadSuccess = React.useCallback(
    (fileId: number) => {
      // After successful upload, update the pool image in the database
      if (poolData?.id) {
        trpcClient.pools.setImageForPool
          .mutate({
            id: poolData.id,
            image_file_id: fileId,
          })
          .then(() => {
            refetch(); // Refetch pool data to show the new image
          })
          .catch(error => {
            console.error("Error setting pool image:", error);
            // Handle error (e.g., show a toast notification)
          });
      }
    },
    [poolData?.id, refetch]
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

  const { data: totalStaked } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "totalStaked",
    query: {
      enabled: !!poolAddress,
    },
  });

  const { data: creatorCut } = useReadContract({
    address: poolAddress,
    abi: CREATOR_POOL_ABI,
    functionName: "creatorCut",
    query: {
      enabled: !!poolAddress,
    },
  });

  // Fan leaderboard data - For now this is mock data since we don't have a way to fetch these from the blockchain yet
  // In a real implementation, this would come from a backend service that tracks pool participants
  const fans: Fan[] = React.useMemo(() => {
    // This would normally come from an API call to fetch fan data
    // For now, create mock data with realistic values derived from pool data
    const mockFanCount = poolData?.fans || 10;
    const mockFans: Fan[] = [];

    for (let i = 0; i < mockFanCount; i++) {
      const stakeAmount = Math.floor(Math.random() * 50000) + 100; // Random stake between 100-50100
      const rewards = Math.floor(stakeAmount * 0.05); // Rewards based on stake
      const tier = Math.min(Math.floor(stakeAmount / 10000) + 1, 4); // Tier based on stake amount

      mockFans.push({
        id: `fan-${i + 1}`,
        username: `user_${Math.random().toString(36).substring(2, 10)}`,
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${Math.random().toString(36).substring(2, 10)}&backgroundColor=b6e3f4,c0aede,d1d4f9,fbcfe8,f9a8d4,f1f0ff`,
        stakedAmount: stakeAmount,
        joinDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0], // Random date in the last 30 days
        tier: tier,
        totalRewards: rewards,
      });
    }

    // Sort by staked amount (descending) to create leaderboard
    return mockFans.sort((a, b) => b.stakedAmount - a.stakedAmount);
  }, [poolData?.fans]);

  // Pool activity data - For now this is mock data since we don't have a way to fetch this from the blockchain yet
  const poolActivities: PoolActivity[] = React.useMemo(() => {
    // This would normally come from an API call to fetch pool activity
    const mockActivity: PoolActivity[] = [];
    const activityTypes: ("stake" | "unstake" | "claim")[] = ["stake", "unstake", "claim"];

    for (let i = 0; i < 17; i++) {
      const type = activityTypes[Math.floor(Math.random() * activityTypes.length)];
      const amount =
        type === "stake"
          ? Math.floor(Math.random() * 10000) + 100
          : type === "unstake"
            ? Math.floor(Math.random() * 5000) + 50
            : Math.floor(Math.random() * 200) + 10;

      mockActivity.push({
        id: `activity-${i + 1}`,
        type: type,
        user: `user_${Math.random().toString(36).substring(2, 8)}`,
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${Math.random().toString(36).substring(2, 10)}&backgroundColor=b6e3f4,c0aede,d1d4f9,fbcfe8,f9a8d4,f1f0ff`,
        amount: amount,
        currency: "REVO",
        timestamp: new Date(
          Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
        ).toISOString(), // Random time in the last 7 days
        txHash: `0x${Math.random().toString(16).substring(2, 12)}...${Math.random().toString(16).substring(2, 8)}`,
      });
    }

    // Sort by timestamp (newest first)
    return mockActivity.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, []);

  // Calculate pagination
  const totalPages = React.useMemo(() => Math.ceil(fans.length / fansPerPage), [fans, fansPerPage]);
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

  // Helper function to format amounts from Wei to readable format
  const formatFromWei = React.useCallback((weiValue: bigint | number) => {
    const numValue = typeof weiValue === "bigint" ? Number(weiValue) : weiValue;
    return numValue / 1e18; // Convert from wei to token amount
  }, []);

  const formatValue = React.useCallback(
    (value: number, currency: string = "REVO") => {
      if (showUSD && currency === "REVO") {
        return `${(value * revoToUSD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${value.toLocaleString()} ${currency}`;
    },
    [showUSD, revoToUSD]
  );

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

  // Mock time series data for total rewards over time
  const generateRewardsData = React.useCallback(() => {
    const data: { date: string; dailyRewards: number; totalRewards: number }[] = [];
    let cumulativeRewards = 0;

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Generate daily rewards (50-300 per day)
      const dailyReward = Math.random() * 250 + 50;
      cumulativeRewards += dailyReward;

      // Ensure we end up close to our current total
      if (i === 0) {
        cumulativeRewards = poolData?.revoStaked || 0;
      }

      data.push({
        date: date.toISOString().split("T")[0],
        dailyRewards: dailyReward,
        totalRewards: cumulativeRewards,
      });
    }

    return data;
  }, [poolData?.revoStaked]);

  // Mock time series data for total stake over time
  const generateStakeData = React.useCallback(() => {
    const data: { date: string; stake: number }[] = [];
    const baseValue = 80000;
    let currentValue = baseValue;

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Simulate growth with some volatility
      const growth = Math.random() * 1500 + 500; // 500-2000 growth per day
      currentValue += growth;

      // Ensure we end up at our current total
      if (i === 0) {
        currentValue = totalStaked ? Number(totalStaked) / 1e18 : baseValue;
      }

      data.push({
        date: date.toISOString().split("T")[0],
        stake: Math.max(currentValue, baseValue),
      });
    }

    return data;
  }, [totalStaked]);

  const rewardsData = React.useMemo(() => generateRewardsData(), [generateRewardsData]);
  const stakeData = React.useMemo(() => generateStakeData(), [generateStakeData]);

  // Combine the data for the chart
  const chartData = React.useMemo(
    () =>
      rewardsData.map((reward, index) => ({
        date: reward.date,
        dailyRewards: reward.dailyRewards,
        totalRewards: reward.totalRewards,
        stake: stakeData[index].stake,
      })),
    [rewardsData, stakeData]
  );

  // Get pool details combining backend and blockchain data
  const userPool = React.useMemo(() => {
    if (!poolData) {
      return null;
    }

    // Convert blockchain values from BigInt to numbers
    const totalStake = totalStaked ? Number(totalStaked) / 1e18 : 0; // Convert from wei to token amount
    const creatorFee = creatorCut ? Number(creatorCut) : 0;

    return {
      id: poolData.id.toString(),
      title: poolName || poolData.description || "Pool Title",
      name: poolName || poolData.description || "Pool Name",
      description: poolData.description || "Pool description not available",
      image:
        poolData.imageUrl ||
        "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=600",
      totalStake: totalStake,
      totalRewards: poolData.revoStaked || 0, // Using revoStaked from the database model
      totalFans: poolData.fans || 0, // Using fans from the database model
      createdDate: new Date().toISOString().split("T")[0], // Using current date since createdAt is not in the type
      stakedAmount: 0, // User's own stake in their pool (0 since it's their pool)
      stakeCurrency: "REVO",
      rewardCurrency: "REVO",
      endDate: new Date().toISOString().split("T")[0], // Using current date since updatedAt is not in the type
      status: "active" as const,
      category: "staking" as const,
      earnedRewards: 0,
      estimatedRewards: 0,
      participants: poolData.fans || 0, // Using fans from the database model
      totalReward: poolData.revoStaked || 0, // Using revoStaked from the database model
    };
  }, [poolData, poolName, totalStaked, creatorCut]);

  // Create line chart path
  const createDualAxisChartElements = React.useCallback(() => {
    const chartWidth = 900;
    const chartHeight = 400;
    const padding = { top: 40, right: 110, bottom: 80, left: 120 };
    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;

    // Get max and min values with 10% padding for better visualization
    const maxDailyRewards = Math.max(...chartData.map(d => d.dailyRewards));
    const minDailyRewards = 0;
    const dailyRewardsMax = maxDailyRewards * 1.15; // Add 15% padding

    const maxStake = Math.max(...chartData.map(d => d.stake));
    const minStake = Math.min(...chartData.map(d => d.stake));
    const stakeRange = maxStake - minStake;
    const stakeMin = minStake - stakeRange * 0.08; // 8% padding below
    const stakeMax = maxStake + stakeRange * 0.12; // 12% padding above

    const dailyRewardsRange = dailyRewardsMax - minDailyRewards;
    const adjustedStakeRange = stakeMax - stakeMin;

    // Create bars for daily rewards
    const barWidth = Math.max((plotWidth / chartData.length) * 0.4, 5); // 40% width, min 5px
    const dailyRewardsBars = chartData.map((point, index) => {
      const x = padding.left + 20 + (index / (chartData.length - 1)) * (plotWidth - 40);
      const barHeight = ((point.dailyRewards - minDailyRewards) / dailyRewardsRange) * plotHeight;
      const y = padding.top + plotHeight - barHeight;
      return {
        x: x - barWidth / 2,
        y,
        width: barWidth,
        height: barHeight,
        value: point.dailyRewards,
        date: point.date,
      };
    });

    // Create points for the stake line
    const stakePoints = chartData.map((point, index) => {
      const x = padding.left + 20 + (index / (chartData.length - 1)) * (plotWidth - 40);
      const y =
        padding.top + plotHeight - ((point.stake - stakeMin) / adjustedStakeRange) * plotHeight;
      return { x, y, value: point.stake, date: point.date };
    });

    // Create SVG path for stake line
    const stakePathData = stakePoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");

    // Create left Y-axis labels (Total Stake) - 5 evenly spaced labels
    const leftYLabels: { value: number; y: number }[] = [];
    const labelCount = 5;
    for (let i = 0; i < labelCount; i++) {
      const value = stakeMin + (adjustedStakeRange * i) / (labelCount - 1);
      const y = padding.top + plotHeight - (i / (labelCount - 1)) * plotHeight;
      leftYLabels.push({ value, y });
    }

    // Create right Y-axis labels (Daily Rewards) - 5 evenly spaced labels
    const rightYLabels: { value: number; y: number }[] = [];
    for (let i = 0; i < labelCount; i++) {
      const value = minDailyRewards + (dailyRewardsRange * i) / (labelCount - 1);
      const y = padding.top + plotHeight - (i / (labelCount - 1)) * plotHeight;
      rightYLabels.push({ value, y });
    }

    // Create X-axis labels (show every 7th day for cleaner look)
    const xLabels: { x: number; label: string; date: string }[] = chartData
      .filter((_, index) => index % 5 === 0 || index === chartData.length - 1)
      .map((point, _) => {
        const originalIndex = chartData.indexOf(point);
        const x = padding.left + 20 + (originalIndex / (chartData.length - 1)) * (plotWidth - 40);
        return {
          x,
          label: new Date(point.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          date: point.date,
        };
      });

    return {
      dailyRewardsBars,
      stakePoints,
      stakePathData,
      leftYLabels,
      rightYLabels,
      xLabels,
      chartWidth,
      chartHeight,
      padding,
    };
  }, [chartData]);

  const chartElements = React.useMemo(
    () => createDualAxisChartElements(),
    [createDualAxisChartElements]
  );

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

  // Show loading state while fetching data
  if (isPoolLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pool data...</p>
        </div>
      </div>
    );
  }

  // If no pool data is available after loading, show an error message
  if (!userPool) {
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

        {/* USD Toggle */}
        <div className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg p-2">
          <span
            className={`text-sm font-medium transition-colors duration-200 ${!showUSD ? "text-purple-600" : "text-gray-500"}`}
          >
            REVO
          </span>
          <button
            onClick={() => setShowUSD(!showUSD)}
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-300"
            title={`Switch to ${showUSD ? "REVO" : "USD"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                showUSD ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium transition-colors duration-200 ${showUSD ? "text-green-600" : "text-gray-500"}`}
          >
            USD
          </span>
        </div>
      </div>

      {/* Pool Overview */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pool Image */}
          <div className="relative h-64 group">
            <div className="h-full rounded-xl overflow-hidden border border-gray-100 shadow-sm">
              <img
                src={userPool.image}
                alt={`${userPool.name} pool`}
                className="w-full h-full object-cover"
              />
            </div>
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
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{userPool.title}</h2>
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
                  <p className="text-gray-600 leading-relaxed">{userPool.description}</p>
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
            <p className="text-2xl font-bold text-gray-900">{formatValue(userPool.totalStake)}</p>
            <p className="text-sm text-green-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +12.5% this month
            </p>
          </div>
        </div>

        {/* Total Rewards */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Trophy className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Total Rewards</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{formatValue(userPool.totalRewards)}</p>
            <p className="text-sm text-blue-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +8.3% this month
            </p>
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
              {userPool.totalFans.toLocaleString()}
            </p>
            <p className="text-sm text-purple-600 flex items-center">
              <TrendingUp className="w-4 h-4 mr-1" />
              +15 new this week
            </p>
          </div>
        </div>

        {/* Pool Status */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-sm text-gray-500">Status</span>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-green-600 capitalize">{userPool.status}</p>
            <p className="text-sm text-gray-600 flex items-center">
              <Clock className="w-4 h-4 mr-1" />
              Ends {new Date(userPool.endDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Pool Performance</h3>
            <p className="text-sm text-gray-600">Track your pool's growth over time</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">Total Stake (Left Axis)</span>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600">Daily Rewards (Right Axis)</span>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div className="relative overflow-x-auto">
          <div className="min-w-[800px]">
            <svg
              width={chartElements.chartWidth}
              height={chartElements.chartHeight}
              className="w-full h-auto bg-white rounded-lg border border-gray-200"
              viewBox={`0 0 ${chartElements.chartWidth} ${chartElements.chartHeight}`}
            >
              {/* Background and grid */}
              <defs>
                <pattern id="grid" width="50" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 40" fill="none" stroke="#f8fafc" strokeWidth="1" />
                </pattern>
              </defs>

              {/* Chart background */}
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

              {/* Horizontal grid lines */}
              {chartElements.leftYLabels?.map((label, index) => (
                <line
                  key={`grid-h-${index}`}
                  x1={chartElements.padding.left + 10}
                  y1={label.y}
                  x2={chartElements.chartWidth - chartElements.padding.right - 10}
                  y2={label.y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              ))}

              {/* Left Y-axis labels (Total Stake) */}
              {chartElements.leftYLabels?.map((label, index) => (
                <g key={`left-label-${index}`}>
                  <text
                    x={chartElements.padding.left - 25}
                    y={label.y + 4}
                    textAnchor="end"
                    className="text-xs fill-green-700 font-medium"
                  >
                    {label.value >= 1000
                      ? `${(label.value / 1000).toFixed(1)}k`
                      : Math.round(label.value).toLocaleString()}
                  </text>
                </g>
              ))}

              {/* Right Y-axis labels (Daily Rewards) */}
              {chartElements.rightYLabels?.map((label, index) => (
                <g key={`right-label-${index}`}>
                  <text
                    x={chartElements.chartWidth - chartElements.padding.right + 25}
                    y={label.y + 4}
                    textAnchor="start"
                    className="text-xs fill-blue-700 font-medium"
                  >
                    {Math.round(label.value).toLocaleString()}
                  </text>
                </g>
              ))}

              {/* X-axis labels */}
              {chartElements.xLabels?.map((label, index) => (
                <g key={`x-label-${index}`}>
                  <text
                    x={label.x}
                    y={chartElements.chartHeight - chartElements.padding.bottom + 30}
                    textAnchor="middle"
                    className="text-xs fill-gray-700 font-medium"
                  >
                    {label.label}
                  </text>
                </g>
              ))}

              {/* Daily Rewards bars */}
              {chartElements.dailyRewardsBars?.map((bar, index) => (
                <rect
                  key={`daily-reward-bar-${index}`}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  fill="#3b82f6"
                  fillOpacity="0.8"
                  className="hover:fill-opacity-100 cursor-pointer transition-all duration-200"
                  rx="2"
                >
                  <title>{`${new Date(bar.date).toLocaleDateString()}: ${Math.round(bar.value).toLocaleString()} REVO Daily Rewards`}</title>
                </rect>
              ))}

              {/* Total Stake line */}
              <path
                d={chartElements.stakePathData}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Total Stake data points */}
              {chartElements.stakePoints?.map((point, index) => (
                <circle
                  key={`stake-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="#10b981"
                  stroke="white"
                  strokeWidth="1.5"
                  className="hover:fill-green-600 cursor-pointer transition-all duration-200"
                >
                  <title>{`${new Date(point.date).toLocaleDateString()}: ${Math.round(point.value).toLocaleString()} REVO Total Stake`}</title>
                </circle>
              ))}

              {/* Axis lines */}
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

      {/* Fan Leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Top Fans</h3>
            <p className="text-sm text-gray-600">Your most dedicated supporters</p>
          </div>
        </div>

        <div className="space-y-4">
          {currentFans.map((fan, index) => {
            const globalIndex = startIndex + index;
            const tierInfo = getTierInfo(fan.tier);

            return (
              <div
                key={fan.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-500 w-6">
                      #{globalIndex + 1}
                    </span>
                    {getRankIcon(globalIndex)}
                  </div>

                  <img
                    src={fan.avatar}
                    alt={fan.username}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                  />

                  <div>
                    <p className="font-medium text-gray-900">{fan.username}</p>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(fan.joinDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatValue(fan.stakedAmount)}</p>
                    <p className="text-sm text-gray-500">Staked</p>
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatValue(fan.totalRewards)}</p>
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
              Showing {startIndex + 1}-{Math.min(endIndex, fans.length)} of {fans.length} fans
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

                <img
                  src={activity.avatar}
                  alt={activity.user}
                  className="w-8 h-8 rounded-full object-cover border border-white shadow-sm"
                />

                <div>
                  <p className="font-medium text-gray-900">{activity.user}</p>
                  <p className="text-sm text-gray-500">{formatTimeAgo(activity.timestamp)}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-900">
                  {formatValue(activity.amount, activity.currency)}
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
      {isPoolModalOpen && (
        <PoolDetailsModal
          pool={userPool}
          isOpen={isPoolModalOpen}
          onClose={() => setIsPoolModalOpen(false)}
        />
      )}

      {/* Image Upload Modal */}
      <ImageUploadModal
        isOpen={isImageUploadModalOpen}
        onClose={() => setIsImageUploadModalOpen(false)}
        onUploadSuccess={handleImageUploadSuccess}
        currentImageUrl={userPool.image}
      />
    </div>
  );
}
