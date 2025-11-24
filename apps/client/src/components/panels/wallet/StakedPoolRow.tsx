import React from "react";
import { Trophy, Link, TrendingUp, Users } from "lucide-react";
import { getChainConfig } from "@ampedbio/web3";
import { formatUnits } from "viem";

import { RewardPool } from "@ampedbio/constants";

// Manually defined type
interface StakedPoolRowProps {
  poolData: {
    userWalletId: number;
    poolId: number;
    stakeAmount: bigint;
    pool: RewardPool;
    pendingRewards: bigint;
    stakedByYou: bigint;
  };
  onClaimRewards: (poolId: number) => void;
  onViewPool: (poolId: number) => void;
}

export default function StakedPoolRow({
  poolData,
  onClaimRewards,
  onViewPool,
}: StakedPoolRowProps) {
  const { pendingRewards, stakedByYou, pool } = poolData;

  const stakedAmount = stakedByYou;
  const chainConfig = getChainConfig(parseInt(pool.chainId));

  return (
    <div className="relative">
      <div
        onClick={() => onViewPool(poolData.poolId)}
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
              {poolData.pool.name || `Pool #${poolData.poolId}`}
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
            title={`You have staked ${formatUnits(
              stakedAmount,
              18
            )} ${chainConfig?.nativeCurrency.symbol || "REVO"} in this pool`}
          >
            <Link className="w-3 h-3 text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              {Number(formatUnits(stakedAmount, 18)) >= 1000
                ? `${(Number(formatUnits(stakedAmount, 18)) / 1000).toFixed(1)}k`
                : Number(formatUnits(stakedAmount, 18)).toLocaleString()}
            </span>
          </div>

          {/* Pending Rewards */}
          <div
            className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full group/tooltip relative"
            title={`You have pending rewards of ${formatUnits(
              pendingRewards,
              18
            )} ${chainConfig?.nativeCurrency.symbol || "REVO"} from this pool`}
          >
            <TrendingUp className="w-3 h-3 text-green-600" />
            <span className="text-xs font-medium text-green-700">
              {Number(formatUnits(pendingRewards, 18)) >= 1000
                ? `${(Number(formatUnits(pendingRewards, 18)) / 1000).toFixed(1)}k`
                : Number(formatUnits(pendingRewards, 18)).toLocaleString()}
            </span>
          </div>

          {/* Participants */}
          <div
            className="flex items-center space-x-1 px-2 py-1 bg-purple-50 rounded-full group/tooltip relative"
            title={`${poolData.pool.fans} fans in this pool`}
          >
            <Users className="w-3 h-3 text-purple-600" />
            <span className="text-xs font-medium text-purple-700">
              {poolData.pool.fans.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Mobile Stats - Show below on mobile */}
        <div className="sm:hidden w-full mt-2">
          <div className="flex flex-wrap gap-1.5">
            <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 rounded-full">
              <Link className="w-3 h-3 text-blue-600" />
              <span className="text-xs font-medium text-blue-700">
                {Number(formatUnits(stakedAmount, 18)) >= 1000
                  ? `${(Number(formatUnits(stakedAmount, 18)) / 1000).toFixed(1)}k`
                  : Number(formatUnits(stakedAmount, 18)).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center space-x-1 px-2 py-1 bg-green-50 rounded-full">
              <TrendingUp className="w-3 h-3 text-green-600" />
              <span className="text-xs font-medium text-green-700">
                {Number(formatUnits(pendingRewards, 18)) >= 1000
                  ? `${(Number(formatUnits(pendingRewards, 18)) / 1000).toFixed(1)}k`
                  : Number(formatUnits(pendingRewards, 18)).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center space-x-1 px-2 py-1 bg-purple-50 rounded-full">
              <Users className="w-3 h-3 text-purple-600" />
              <span className="text-xs font-medium text-purple-700">
                {poolData.pool.fans.toLocaleString()}
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
            onClick={e => {
              e.stopPropagation();
              onClaimRewards(poolData.poolId);
            }}
            className="px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition-colors duration-200"
            title="Claim your earned rewards"
          >
            <span className="hidden sm:inline">Claim</span>
            <span className="sm:hidden">💰</span>
          </button>

          <button
            onClick={e => {
              e.stopPropagation();
              onViewPool(poolData.poolId);
            }}
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
