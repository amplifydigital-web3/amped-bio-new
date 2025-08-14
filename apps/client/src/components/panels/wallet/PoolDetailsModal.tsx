import React from "react";
import { Trophy, Users, Coins, TrendingUp, ExternalLink, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

interface PoolDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: {
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
  } | null;
}

export default function PoolDetailsModal({ isOpen, onClose, pool }: PoolDetailsModalProps) {
  // Mock staking tiers data with utility focus
  const stakingTiers = [
    {
      level: 1,
      name: "Bronze Tier",
      minStake: 100,
      rewardMultiplier: 1,
      utilities: [
        { icon: "📰", label: "Weekly Newsletter" },
        { icon: "💬", label: "Community Chat" },
        { icon: "🎯", label: "Basic Rewards" },
        { icon: "📊", label: "Pool Analytics" },
      ],
    },
    {
      level: 2,
      name: "Silver Tier",
      minStake: 1000,
      rewardMultiplier: 1.25,
      utilities: [
        { icon: "🎟️", label: "Raffle Entries" },
        { icon: "⚡", label: "Early Access" },
        { icon: "🎭", label: "Exclusive Content" },
        { icon: "🏆", label: "Silver Badge" },
        { icon: "📞", label: "Priority Support" },
        { icon: "🎪", label: "Monthly Events" },
      ],
    },
    {
      level: 3,
      name: "Gold Tier",
      minStake: 5000,
      rewardMultiplier: 1.5,
      utilities: [
        { icon: "🎲", label: "Premium Raffles" },
        { icon: "🔐", label: "VIP Groups" },
        { icon: "👑", label: "Gold Badge" },
        { icon: "🎬", label: "Behind Scenes" },
        { icon: "🗳️", label: "Governance Vote" },
        { icon: "🎨", label: "Custom Avatar" },
      ],
    },
    {
      level: 4,
      name: "Diamond Tier",
      minStake: 25000,
      rewardMultiplier: 2,
      utilities: [
        { icon: "💎", label: "Diamond Badge" },
        { icon: "🎪", label: "Private Events" },
        { icon: "🎁", label: "NFT Airdrops" },
        { icon: "👥", label: "Inner Circle" },
        { icon: "🏛️", label: "Advisory Board" },
        { icon: "💰", label: "Revenue Share" },
      ],
    },
  ];

  if (!pool) return null;

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
    console.log("Add stake to pool:", pool.id);
    // Implementation for adding more stake
  };

  const handleReduceStake = () => {
    console.log("Reduce stake from pool:", pool.id);
    // Implementation for reducing stake
  };

  const handleViewOnExplorer = () => {
    console.log("View pool on blockchain explorer:", pool.id);
    // Implementation to open blockchain explorer
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col p-0">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <DialogTitle className="text-2xl font-bold text-gray-900">{pool.title}</DialogTitle>
            <DialogDescription className="text-gray-600 text-sm mt-1">
              {pool.description}
            </DialogDescription>
          </div>
          <DialogClose className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors duration-200" />
        </div>

        {/* Modal Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Hero Section - Image and Stats Side by Side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Pool Image */}
              <div className="relative h-64">
                <div className="h-full rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gradient-to-br from-blue-50 to-purple-50">
                  {pool.image ? (
                    <img
                      src={pool.image}
                      alt={`${pool.title} pool`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <Trophy className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Corner Badges */}
                <div className="absolute top-4 left-4 flex flex-col space-y-2">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 shadow-sm ${getCategoryColor(pool.category)}`}
                  >
                    {getCategoryIcon(pool.category)}
                    <span className="capitalize">{pool.category} Pool</span>
                  </span>
                </div>

                <div className="absolute top-4 right-4">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${getStatusColor(pool.status)}`}
                  >
                    {getStatusText(pool.status)}
                  </span>
                </div>
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
                      {pool.stakedAmount.toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">{pool.stakeCurrency}</div>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Earned</span>
                    </div>
                    <div className="text-xl font-bold text-green-900">{pool.earnedRewards}</div>
                    <div className="text-xs text-green-600">{pool.rewardCurrency}</div>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 flex flex-col justify-center">
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Total Pool Stake</span>
                    </div>
                    <div className="text-xl font-bold text-purple-900">
                      {pool.totalReward.toLocaleString()}
                    </div>
                    <div className="text-xs text-purple-600">{pool.stakeCurrency}</div>
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
                </div>
              </div>
            </div>

            {/* Staking Tiers Section */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-6 flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                <span>Staking Tiers</span>
              </h4>

              <div className="space-y-4">
                {stakingTiers.map(tier => {
                  const userStake = pool.stakedAmount;
                  const isUnlocked = userStake >= tier.minStake;
                  const isCurrent =
                    userStake >= tier.minStake &&
                    (stakingTiers[tier.level]
                      ? userStake < stakingTiers[tier.level].minStake
                      : true);

                  return (
                    <div
                      key={tier.level}
                      className={`rounded-lg border-2 p-4 transition-all duration-200 ${
                        isCurrent
                          ? "border-blue-300 bg-blue-50"
                          : isUnlocked
                            ? "border-green-300 bg-green-50"
                            : "border-gray-200 bg-white opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                              isCurrent
                                ? "bg-blue-600 text-white"
                                : isUnlocked
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-400 text-white"
                            }`}
                          >
                            {tier.level}
                          </div>
                          <div>
                            <h5
                              className={`font-semibold ${
                                isCurrent
                                  ? "text-blue-900"
                                  : isUnlocked
                                    ? "text-green-900"
                                    : "text-gray-600"
                              }`}
                            >
                              {tier.name}
                            </h5>
                            <p className="text-xs text-gray-600">
                              {tier.minStake.toLocaleString()}+ {pool.stakeCurrency}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            isCurrent
                              ? "bg-blue-100 text-blue-700"
                              : isUnlocked
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isCurrent ? "Current" : isUnlocked ? "Unlocked" : "Locked"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {tier.utilities.map((utility, index) => (
                          <div
                            key={index}
                            className={`flex items-center space-x-2 text-xs p-2 rounded ${
                              isUnlocked ? "bg-white" : "bg-gray-50"
                            }`}
                          >
                            <span className="text-sm">{utility.icon}</span>
                            <span className={isUnlocked ? "text-gray-700" : "text-gray-500"}>
                              {utility.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {tier.rewardMultiplier > 1 && (
                        <div className="pt-3 border-t border-gray-200">
                          <div
                            className={`text-xs font-medium ${
                              isUnlocked ? "text-purple-700" : "text-gray-500"
                            }`}
                          >
                            🚀 {tier.rewardMultiplier}x Reward Multiplier
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  💡 <strong>Your current stake:</strong> {pool.stakedAmount.toLocaleString()}{" "}
                  {pool.stakeCurrency}
                  {pool.stakedAmount < 25000 && (
                    <span className="block mt-1">
                      Stake{" "}
                      {(stakingTiers.find(t => pool.stakedAmount < t.minStake)?.minStake || 25000) -
                        pool.stakedAmount}{" "}
                      more to unlock the next tier!
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <DialogFooter className="border-t border-gray-100 bg-white p-6 mt-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 sm:space-x-4 w-full">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
