import { useState } from "react";
import {
  CoinsIcon,
  Users,
  TrendingUp,
  DollarSign,
  Wallet,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap,
} from "lucide-react";
import type { ThemeConfig } from "../../types/editor";
import { type MediaBlock } from "@ampedbio/constants";
import { formatNumberWithSeparators } from "@/utils/numberUtils";

interface CreatorPoolBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

export function CreatorPoolBlock({ theme }: CreatorPoolBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Mock data - in a real app, this would come from your smart contract
  const poolStats = {
    totalStaked: 150000,
    tokenPrice: 2.34, // USD
    totalRewards: 7500,
    activeStakers: 250,
    averageAPR: 5,
    totalEarnedByFans: 12500,
    lastMonthEarned: 2800,
    // Additional details for expanded view
    contractAddress: "0x1234...5678",
    rewardDistribution: "Weekly",
    maxStakeAmount: 50000,
    stakingFee: 0.5,
    withdrawalFee: 1.0,
    earlyWithdrawalPenalty: 5,
    poolLiquidity: 450000,
    totalValueLocked: 351000,
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="w-full p-4 bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg mb-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent"
            style={{ fontFamily: "Montserrat" }}
          >
            Creator Pool
          </h3>
          <p
            className="text-xs mt-0.5 opacity-80"
            style={{
              fontFamily: theme.fontFamily,
              color: theme.fontColor,
            }}
          >
            Stake tokens to earn rewards
          </p>
        </div>
        <button
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-medium"
          style={{ fontFamily: "Montserrat" }}
        >
          Stake 🥩 Me Now
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Main Stats */}
        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-blue-400 mb-2">
            <div className="p-1.5 bg-blue-400/10 rounded-md mr-2">
              <CoinsIcon className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Total Staked
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {formatNumberWithSeparators(poolStats.totalStaked)}
            </p>
            <div className="flex items-center text-green-400 text-xs">
              <DollarSign className="w-3 h-3 mr-0.5" />
              <span>{formatUSD(poolStats.totalStaked * poolStats.tokenPrice)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-green-400 mb-2">
            <div className="p-1.5 bg-green-400/10 rounded-md mr-2">
              <Wallet className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Total Earned by Fans
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {formatNumberWithSeparators(poolStats.totalEarnedByFans)}
            </p>
            <div className="flex items-center text-green-400 text-xs">
              <DollarSign className="w-3 h-3 mr-0.5" />
              <span>{formatUSD(poolStats.totalEarnedByFans * poolStats.tokenPrice)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center text-blue-400 mb-2">
            <div className="p-1.5 bg-blue-400/10 rounded-md mr-2">
              <Users className="w-4 h-4" />
            </div>
            <span className="text-xs font-medium" style={{ fontFamily: "Montserrat" }}>
              Active Stakers
            </span>
          </div>
          <div>
            <p
              className="text-base font-bold"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              {formatNumberWithSeparators(poolStats.activeStakers)}
            </p>
            <p className="text-xs text-blue-400 mt-1">Growing community</p>
          </div>
        </div>
      </div>

      {/* Expand Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full mt-4 flex items-center justify-center space-x-2 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/10"
        style={{ fontFamily: theme.fontFamily }}
      >
        <span className="text-sm" style={{ color: theme.fontColor }}>
          {isExpanded ? "Show Less" : "Show More Details"}
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" style={{ color: theme.fontColor }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: theme.fontColor }} />
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {/* Pool Details */}
          <div className="col-span-2 bg-white/5 rounded-lg p-4 border border-white/10">
            <h4
              className="text-sm font-semibold mb-3"
              style={{
                fontFamily: "Montserrat",
                color: theme.fontColor,
              }}
            >
              Pool Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Contract Address
                </p>
                <a
                  href={`https://etherscan.io/address/${poolStats.contractAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm flex items-center space-x-1 text-blue-400 hover:text-blue-300"
                >
                  <span>{poolStats.contractAddress}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Reward Distribution
                </p>
                <p className="text-sm" style={{ color: theme.fontColor }}>
                  {poolStats.rewardDistribution}
                </p>
              </div>
            </div>
          </div>

          {/* Rewards & Performance */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-center space-x-2 mb-3">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <h4
                className="text-sm font-semibold"
                style={{
                  fontFamily: "Montserrat",
                  color: theme.fontColor,
                }}
              >
                Rewards & Performance
              </h4>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Total Rewards
                </p>
                <p className="text-sm font-bold" style={{ color: theme.fontColor }}>
                  {formatNumberWithSeparators(poolStats.totalRewards)} tokens
                </p>
                <div className="flex items-center text-green-400 text-xs mt-1">
                  <DollarSign className="w-3 h-3 mr-0.5" />
                  <span>{formatUSD(poolStats.totalRewards * poolStats.tokenPrice)}</span>
                </div>
              </div>
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Last Month Earned
                </p>
                <p className="text-sm font-bold" style={{ color: theme.fontColor }}>
                  {formatNumberWithSeparators(poolStats.lastMonthEarned)} tokens
                </p>
                <div className="flex items-center text-green-400 text-xs mt-1">
                  <DollarSign className="w-3 h-3 mr-0.5" />
                  <span>{formatUSD(poolStats.lastMonthEarned * poolStats.tokenPrice)}</span>
                </div>
              </div>
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Average APR
                </p>
                <p className="text-sm font-bold" style={{ color: theme.fontColor }}>
                  {poolStats.averageAPR}%
                </p>
                <p className="text-xs text-green-400 mt-1">Annual yield</p>
              </div>
            </div>
          </div>

          {/* Pool Metrics */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-center space-x-2 mb-3">
              <Zap className="w-4 h-4 text-yellow-400" />
              <h4
                className="text-sm font-semibold"
                style={{
                  fontFamily: "Montserrat",
                  color: theme.fontColor,
                }}
              >
                Pool Metrics
              </h4>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Total Value Locked
                </p>
                <p className="text-sm" style={{ color: theme.fontColor }}>
                  {formatUSD(poolStats.totalValueLocked)}
                </p>
              </div>
              <div>
                <p className="text-xs opacity-70 mb-1" style={{ color: theme.fontColor }}>
                  Pool Liquidity
                </p>
                <p className="text-sm" style={{ color: theme.fontColor }}>
                  {formatUSD(poolStats.poolLiquidity)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
