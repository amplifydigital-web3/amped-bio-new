import React, { useState } from "react";
import {
  ArrowLeft,
  CoinsIcon,
  Users,
  Clock,
  TrendingUp,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Crown,
  Medal,
} from "lucide-react";
import { StarRating } from "../gallery/StarRating";

interface Staker {
  rank: number;
  address: string;
  name: string;
  avatar: string;
  stakedAmount: number;
  joinedDate: string;
  lastStaked: string;
  rewards: number;
  rewardsUSD: number;
}

interface CreatorPoolDetailProps {
  poolId: string;
  onBack: () => void;
}

export function CreatorPoolDetail({ poolId, onBack }: CreatorPoolDetailProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Mock data - in a real app, this would come from your API/smart contract
  const poolDetails = {
    id: poolId,
    name: "Web3 Development Pool",
    creator: {
      name: "Alex Thompson",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop",
      verified: true,
    },
    description:
      "Stake tokens to earn rewards and get exclusive access to Web3 development resources, tutorials, and community events.",
    totalStaked: 2500000,
    tokenPrice: 2.34,
    participants: 850,
    maxParticipants: 1000,
    apr: 12.5,
    rating: 4.8,
    reviews: 156,
    growth: 25,
    lockPeriod: 30,
    minStake: 100,
    tokenAddress: "0x1234...5678",
    createdAt: "2023-08-15",
  };

  // Generate mock stakers data
  const allStakers: Staker[] = Array.from({ length: 100 }, (_, i) => ({
    rank: i + 1,
    address: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
    name: `staker_${i + 1}.eth`,
    avatar: `https://images.unsplash.com/photo-${1570295999919 + i}?w=48&h=48&fit=crop`,
    stakedAmount: Math.floor(Math.random() * 100000) + 10000,
    joinedDate: new Date(Date.now() - Math.random() * 10000000000).toISOString().split("T")[0],
    lastStaked: new Date(Date.now() - Math.random() * 1000000000).toISOString().split("T")[0],
    rewards: Math.floor(Math.random() * 5000) + 1000,
    rewardsUSD: Math.floor(Math.random() * 10000) + 2000,
  })).sort((a, b) => b.stakedAmount - a.stakedAmount);

  const totalPages = Math.ceil(allStakers.length / itemsPerPage);
  const currentStakers = allStakers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="text-gray-500 font-medium">#{rank}</span>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{poolDetails.name}</h2>
            <div className="flex items-center space-x-2 mt-1">
              <img
                src={poolDetails.creator.avatar}
                alt={poolDetails.creator.name}
                className="w-6 h-6 rounded-full"
              />
              <span className="text-sm text-gray-500">by {poolDetails.creator.name}</span>
              {poolDetails.creator.verified && (
                <div className="bg-blue-500 rounded-full p-0.5">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <StarRating rating={poolDetails.rating} size="sm" />
          <span className="text-sm text-gray-500">
            ({poolDetails.rating}) · {poolDetails.reviews} reviews
          </span>
        </div>
      </div>

      {/* Pool Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CoinsIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Staked</p>
              <p className="font-medium">
                {formatUSD(poolDetails.totalStaked * poolDetails.tokenPrice)}
              </p>
              <p className="text-xs text-gray-500">
                {formatNumber(poolDetails.totalStaked)} tokens
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">APR</p>
              <p className="font-medium">{poolDetails.apr}%</p>
              <p className="text-xs text-gray-500">Annual yield</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Participants</p>
              <p className="font-medium">
                {poolDetails.participants} / {poolDetails.maxParticipants}
              </p>
              <p className="text-xs text-gray-500">
                {((poolDetails.participants / poolDetails.maxParticipants) * 100).toFixed(1)}%
                filled
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Lock Period</p>
              <p className="font-medium">{poolDetails.lockPeriod} Days</p>
              <p className="text-xs text-gray-500">Min. {poolDetails.minStake} tokens</p>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-medium text-gray-900 mb-2">About this Pool</h3>
        <p className="text-gray-600">{poolDetails.description}</p>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-gray-500">Created {poolDetails.createdAt}</span>
          <a
            href={`https://etherscan.io/address/${poolDetails.tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-700"
          >
            View Contract
          </a>
        </div>
      </div>

      {/* Stakers List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium text-gray-900">Top Stakers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Staker
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Staked Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rewards Earned
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Staked
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentStakers.map(staker => (
                <tr key={staker.address} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center w-8">
                      {getRankDisplay(staker.rank)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <img src={staker.avatar} alt={staker.name} className="w-8 h-8 rounded-full" />
                      <div>
                        <p className="font-medium text-gray-900">{staker.name}</p>
                        <p className="text-sm text-gray-500">{staker.address}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">
                        {formatNumber(staker.stakedAmount)} tokens
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatUSD(staker.stakedAmount * poolDetails.tokenPrice)}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">
                        {formatNumber(staker.rewards)} tokens
                      </p>
                      <p className="text-sm text-green-600">{formatUSD(staker.rewardsUSD)}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {staker.lastStaked}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {staker.joinedDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
            {Math.min(currentPage * itemsPerPage, allStakers.length)} of {allStakers.length} stakers
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
