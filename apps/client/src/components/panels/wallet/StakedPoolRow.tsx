import React from "react";
import { Trophy, Link, TrendingUp } from "lucide-react";
import { getChainConfig } from "@ampedbio/web3";
import { formatUnits, formatEther } from "viem";
import { toast } from "react-hot-toast";
import { usePoolReader } from "../../../hooks/usePoolReader";
import { UserStakedPoolWithNullables } from "@ampedbio/constants";
import { useAccount } from "wagmi";
import { useWalletContext } from "@/contexts/WalletContext";

interface StakedPoolRowProps {
  poolData: UserStakedPoolWithNullables;
  refetchAllStakedPools: () => void;
  onViewPool: (poolId: number) => void;
  currentChainId: string;
}

export default function StakedPoolRow({
  poolData,
  refetchAllStakedPools,
  onViewPool,
  currentChainId,
}: StakedPoolRowProps) {
  const { pendingRewards, stakedByYou, pool } = poolData;
  const [isClaiming, setIsClaiming] = React.useState(false);

  const { address: userAddress } = useAccount();
  const { isWeb3Wallet } = useWalletContext();

  // Use the usePoolReader hook for reading operations
  const {
    claimReward,
    pendingReward: hookPendingReward,
    fanStake: hookFanStake,
    fetchAllData,
  } = usePoolReader(
    pool.address as `0x${string}` | undefined,
    userAddress as `0x${string}` | undefined
  );

  const stakedAmount = stakedByYou;
  const chainConfig = getChainConfig(parseInt(currentChainId));
  const currencySymbol = chainConfig?.nativeCurrency.symbol || "REVO";

  // Function to handle the direct claim process
  const handleClaim = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClaiming(true); // Set loading to true when claim process starts

    try {
      // Show a loading toast
      toast.loading("Processing claim...", { id: "claim-process" });

      await claimReward();

      // Show success toast
      toast.success(
        `Successfully claimed ${hookPendingReward ? parseFloat(formatEther(hookPendingReward)).toLocaleString() : "0"} ${currencySymbol}! Your wallet has been updated.`,
        { id: "claim-process" }
      );

      // Refetch all pool data after a successful claim to update the UI
      await fetchAllData();

      // Refetch all staked pools to update the display
      refetchAllStakedPools();
    } catch {
      // Show error toast
      toast.error("Failed to claim rewards. Please try again.", { id: "claim-process" });
    } finally {
      setIsClaiming(false); // Reset loading state
    }
  };

  // Function to handle view pool click
  const handleViewPool = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewPool(poolData.pool.id);
  };

  return (
    <div className="relative">
      <div
        onClick={() => onViewPool(poolData.pool.id)}
        className={`
          flex items-center py-3 px-2 hover:bg-gray-50 cursor-pointer transition-colors duration-200 group
          border-b border-gray-100
        `}
      >
        {/* Left Zone (56%) - Thumbnail, Name, Badges */}
        <div className="flex items-center space-x-3 flex-1 min-w-0" style={{ flexBasis: "56%" }}>
          {/* 40x40 Thumbnail */}
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {poolData.pool.image ? (
              <img
                src={poolData.pool.image.url}
                alt={`${poolData.pool.name} pool`}
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
              {poolData.pool.name || `Pool #${poolData.pool.id}`}
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
            title={`You have staked ${
              hookFanStake ? formatUnits(hookFanStake, 18) : "0"
            } ${chainConfig?.nativeCurrency.symbol || "REVO"} in this pool`}
          >
            <Link className="w-3 h-3 text-blue-600" />
            {hookFanStake !== undefined ? (
              <span className="text-xs font-medium text-blue-700">
                {Number(formatUnits(hookFanStake, 18)) >= 1000
                  ? `${(Number(formatUnits(hookFanStake, 18)) / 1000).toFixed(1)}k`
                  : Number(formatUnits(hookFanStake, 18)).toLocaleString()}
              </span>
            ) : (
              <div className="h-4 bg-gray-200 rounded animate-pulse w-12"></div>
            )}
          </div>

          {/* Pending Rewards */}
          <div
            className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full group/tooltip relative"
            title={`You have pending rewards of ${
              hookPendingReward ? formatUnits(hookPendingReward, 18) : "0"
            } ${chainConfig?.nativeCurrency.symbol || "REVO"} from this pool`}
          >
            <TrendingUp className="w-3 h-3 text-green-600" />
            {hookPendingReward !== undefined ? (
              <span className="text-xs font-medium text-green-700">
                {Number(formatUnits(hookPendingReward, 18)) >= 1000
                  ? `${(Number(formatUnits(hookPendingReward, 18)) / 1000).toFixed(1)}k`
                  : Number(formatUnits(hookPendingReward, 18)).toLocaleString()}
              </span>
            ) : (
              <div className="h-4 bg-gray-200 rounded animate-pulse w-12"></div>
            )}
          </div>
        </div>

        {/* Mobile Stats - Show below on mobile */}
        <div className="sm:hidden w-full mt-2">
          <div className="flex flex-wrap gap-1.5">
            <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded-full">
              <Link className="w-3 h-3 text-blue-600" />
              {hookFanStake !== undefined ? (
                <span className="text-xs font-medium text-blue-700">
                  {Number(formatUnits(hookFanStake, 18)) >= 1000
                    ? `${(Number(formatUnits(hookFanStake, 18)) / 1000).toFixed(1)}k`
                    : Number(formatUnits(hookFanStake, 18)).toLocaleString()}
                </span>
              ) : (
                <div className="h-4 bg-gray-200 rounded animate-pulse w-8"></div>
              )}
            </div>
            <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full">
              <TrendingUp className="w-3 h-3 text-green-600" />
              {hookPendingReward !== undefined ? (
                <span className="text-xs font-medium text-green-700">
                  {Number(formatUnits(hookPendingReward, 18)) >= 1000
                    ? `${(Number(formatUnits(hookPendingReward, 18)) / 1000).toFixed(1)}k`
                    : Number(formatUnits(hookPendingReward, 18)).toLocaleString()}
                </span>
              ) : (
                <div className="h-4 bg-gray-200 rounded animate-pulse w-8"></div>
              )}
            </div>
          </div>
        </div>

        {/* Right Zone (12%) - Actions */}
        <div
          className="flex items-center space-x-1 flex-shrink-0 ml-2"
          style={{ flexBasis: "12%" }}
        >
          <button
            onClick={handleClaim}
            className={`px-2 py-1.5 text-white text-xs font-medium rounded-md transition-colors duration-200 ${
              isWeb3Wallet
                ? isClaiming
                  ? "bg-gray-400 opacity-50 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
                : "bg-gray-400 cursor-not-allowed"
            }`}
            disabled={!isWeb3Wallet || isClaiming}
          >
            {isClaiming ? (
              <span className="flex items-center">
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
              </span>
            ) : (
              <>
                <span className="hidden sm:inline">Claim</span>
                <span className="sm:hidden">💰</span>
              </>
            )}
          </button>

          <button
            onClick={handleViewPool}
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
}
