import React, { useState } from "react";
import {
  Users,
  Gift,
  Coins,
  Target,
  Trophy,
  Plus,
  Upload,
  Percent,
  Info,
  X,
  Check,
  Save,
  Sparkles,
  Star,
  Crown,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface StakingTier {
  id: string;
  name: string;
  minStake: number;
  perks: string[];
  color: string;
}

interface AnalyticsPoint {
  date: string;
  value: number;
}

interface LineChartProps {
  data: AnalyticsPoint[];
  color: string;
  title: string;
}

interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar: string;
  stakeAmount: number;
  tier: string;
  joinDate: string;
  isVerified: boolean;
}

interface TierIconEntry {
  icon: LucideIcon;
  color: string;
}

export function RewardPoolPage() {
  const [hasPool, setHasPool] = useState(false); // Set to false to show creation form
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showUSD, setShowUSD] = useState(false);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionStep, setTransactionStep] = useState<"confirming" | "confirmed">("confirming");
  const [transactionHash, setTransactionHash] = useState("");
  const [poolCreatedDate] = useState(new Date().toISOString());
  const [poolName, setPoolName] = useState("");
  const [poolDescription, setPoolDescription] = useState("");
  const [poolImage, setPoolImage] = useState<string | null>(null);
  const [yourStake, setYourStake] = useState("");
  const [creatorFee, setCreatorFee] = useState(5);
  const [stakingTiers, setStakingTiers] = useState<StakingTier[]>([]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = e => {
        if (e.target?.result && typeof e.target.result === "string") {
          setPoolImage(e.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Mock analytics data
  const generateAnalyticsData = () => {
    const days = 30;
    const stakeData: AnalyticsPoint[] = [];
    const earningsData: AnalyticsPoint[] = [];
    let currentStake = parseInt(yourStake) || 1000;
    let currentEarnings = 0;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      // Simulate stake growth
      const stakeGrowth = Math.random() * 200 - 50; // -50 to +150
      currentStake = Math.max(currentStake + stakeGrowth, parseInt(yourStake) || 1000);

      // Simulate earnings growth
      const earningsGrowth = Math.random() * 50;
      currentEarnings += earningsGrowth;

      stakeData.push({
        date: date.toISOString().split("T")[0],
        value: currentStake,
      });

      earningsData.push({
        date: date.toISOString().split("T")[0],
        value: currentEarnings,
      });
    }

    return { stakeData, earningsData };
  };

  // Mock leaderboard data
  const mockLeaderboard: LeaderboardEntry[] = [
    {
      rank: 1,
      username: "crypto_whale.eth",
      avatar:
        "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 15000,
      tier: "Diamond",
      joinDate: "2025-01-05",
      isVerified: true,
    },
    {
      rank: 2,
      username: "defi_master",
      avatar:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 12500,
      tier: "Diamond",
      joinDate: "2025-01-07",
      isVerified: false,
    },
    {
      rank: 3,
      username: "nft_collector_pro",
      avatar:
        "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 8750,
      tier: "Gold",
      joinDate: "2025-01-08",
      isVerified: true,
    },
    {
      rank: 4,
      username: "blockchain_dev",
      avatar:
        "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 6200,
      tier: "Gold",
      joinDate: "2025-01-10",
      isVerified: false,
    },
    {
      rank: 5,
      username: "crypto_enthusiast",
      avatar:
        "https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 4500,
      tier: "Silver",
      joinDate: "2025-01-12",
      isVerified: false,
    },
    {
      rank: 6,
      username: "hodl_master",
      avatar:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 3200,
      tier: "Silver",
      joinDate: "2025-01-13",
      isVerified: true,
    },
    {
      rank: 7,
      username: "web3_builder",
      avatar:
        "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 2800,
      tier: "Silver",
      joinDate: "2025-01-14",
      isVerified: false,
    },
    {
      rank: 8,
      username: "token_trader",
      avatar:
        "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=100",
      stakeAmount: 1500,
      tier: "Bronze",
      joinDate: "2025-01-15",
      isVerified: false,
    },
  ];

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "Diamond":
        return "bg-purple-100 text-purple-700";
      case "Gold":
        return "bg-yellow-100 text-yellow-700";
      case "Silver":
        return "bg-gray-100 text-gray-700";
      case "Bronze":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "Diamond":
        return "💎";
      case "Gold":
        return "🏆";
      case "Silver":
        return "🥈";
      case "Bronze":
        return "🥉";
      default:
        return "⭐";
    }
  };

  // Simple line chart component
  const LineChart = ({ data, color, title }: LineChartProps) => {
    if (!data || data.length === 0) return null;

    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const valueRange = maxValue - minValue || 1;

    const chartWidth = 300;
    const chartHeight = 120;
    const padding = 20;

    const createPath = (data: AnalyticsPoint[]): string => {
      const points = data.map((point, index) => {
        const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
        const y =
          chartHeight -
          padding -
          ((point.value - minValue) / valueRange) * (chartHeight - 2 * padding);
        return `${x},${y}`;
      });

      return `M ${points.join(" L ")}`;
    };

    const createAreaPath = (data: AnalyticsPoint[]): string => {
      const points = data.map((point, index) => {
        const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
        const y =
          chartHeight -
          padding -
          ((point.value - minValue) / valueRange) * (chartHeight - 2 * padding);
        return `${x},${y}`;
      });

      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const lastX = lastPoint.split(",")[0];
      const firstX = firstPoint.split(",")[0];

      return `M ${firstX},${chartHeight - padding} L ${points.join(" L ")} L ${lastX},${chartHeight - padding} Z`;
    };

    const linePath = createPath(data);
    const areaPath = createAreaPath(data);

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">{title}</h4>
        <div className="relative">
          <svg
            width={chartWidth}
            height={chartHeight}
            className="w-full h-auto"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          >
            <defs>
              <linearGradient id={`areaGradient-${title}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            <path d={areaPath} fill={`url(#areaGradient-${title})`} />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {data.map((point, index) => {
              const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
              const y =
                chartHeight -
                padding -
                ((point.value - minValue) / valueRange) * (chartHeight - 2 * padding);

              return <circle key={index} cx={x} cy={y} r="3" fill={color} opacity="0.8" />;
            })}
          </svg>

          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{data[0]?.value.toLocaleString()}</span>
            <span>{data[data.length - 1]?.value.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  const addTier = () => {
    const newTier: StakingTier = {
      id: Date.now().toString(),
      name: "New Tier",
      minStake: 0,
      perks: ["Add your perks here"],
      color: "bg-blue-100 text-blue-700",
    };
    setStakingTiers([...stakingTiers, newTier]);
  };

  const updateTier = <K extends keyof StakingTier>(id: string, field: K, value: StakingTier[K]) => {
    setStakingTiers(tiers =>
      tiers.map(tier => (tier.id === id ? { ...tier, [field]: value } : tier))
    );
  };

  const removeTier = (id: string) => {
    setStakingTiers(tiers => tiers.filter(tier => tier.id !== id));
  };

  const addPerkToTier = (tierId: string) => {
    setStakingTiers(tiers =>
      tiers.map(tier =>
        tier.id === tierId ? { ...tier, perks: [...tier.perks, "New perk"] } : tier
      )
    );
  };

  const updatePerk = (tierId: string, perkIndex: number, value: string) => {
    setStakingTiers(tiers =>
      tiers.map(tier =>
        tier.id === tierId
          ? {
              ...tier,
              perks: tier.perks.map((perk, index) => (index === perkIndex ? value : perk)),
            }
          : tier
      )
    );
  };

  const removePerk = (tierId: string, perkIndex: number) => {
    setStakingTiers(tiers =>
      tiers.map(tier =>
        tier.id === tierId
          ? {
              ...tier,
              perks: tier.perks.filter((_, index) => index !== perkIndex),
            }
          : tier
      )
    );
  };

  const handleCreatePool = () => {
    setShowSummaryModal(true);
  };

  const handleLaunchPool = () => {
    // Close summary modal and show transaction modal
    setShowSummaryModal(false);
    setShowTransactionModal(true);
    setTransactionStep("confirming");

    // Generate mock transaction hash
    const mockTxHash = "0x" + Math.random().toString(16).substr(2, 64);
    setTransactionHash(mockTxHash);

    // Simulate transaction confirmation after 3 seconds
    setTimeout(() => {
      setTransactionStep("confirmed");
    }, 3000);
  };

  const tierIcons: TierIconEntry[] = [
    { icon: Star, color: "text-orange-600" },
    { icon: Crown, color: "text-gray-600" },
    { icon: Trophy, color: "text-yellow-600" },
    { icon: Zap, color: "text-purple-600" },
    { icon: Gift, color: "text-pink-600" },
  ];

  if (hasPool) {
    const { stakeData, earningsData } = generateAnalyticsData();
    const totalStaked = mockLeaderboard.reduce((sum, fan) => sum + fan.stakeAmount, 0);
    const totalEarnings = earningsData[earningsData.length - 1]?.value || 0;

    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {poolName || "Your Reward Pool"}
              </h1>
              <p className="text-gray-600">
                {poolDescription || "Pool analytics and fan leaderboard"}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                🟢 Live
              </span>
              <span className="text-sm text-gray-500">
                Created {new Date(poolCreatedDate).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* USD Toggle - Far Right */}
          <div className="flex items-center space-x-3 bg-white border border-gray-200 rounded-lg px-4 py-2">
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

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-600 rounded-lg">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-900">
                  {showUSD
                    ? `$${(125420 * 0.25).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "125,420 REVO"}
                </div>
                <div className="text-sm text-blue-700">Total Stake</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-green-600 rounded-lg">
                <Gift className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-900">
                  {showUSD
                    ? `$${(8750 * 0.25).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "8,750 REVO"}
                </div>
                <div className="text-sm text-green-700">Total Rewards</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-purple-600 rounded-lg">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-900">
                  {showUSD
                    ? `$${(2500 * 0.25).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "2,500 REVO"}
                </div>
                <div className="text-sm text-purple-700">My Stake</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-orange-600 rounded-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-900">247</div>
                <div className="text-sm text-orange-700">Participants</div>
              </div>
            </div>
          </div>
        </div>

        {/* Combined Chart */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Pool Performance Over Time</h3>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-gray-600">Total Stake</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-gray-600">Total Rewards</span>
              </div>
            </div>
          </div>
          <div className="h-64">
            <svg width="100%" height="100%" viewBox="0 0 400 200" className="w-full h-full">
              <defs>
                <linearGradient id="stakeGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
                </linearGradient>
                <linearGradient id="rewardsGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Stake Area fill */}
              <path
                d="M 20,180 L 40,160 L 80,140 L 120,120 L 160,100 L 200,85 L 240,75 L 280,70 L 320,65 L 360,60 L 380,55 L 380,180 Z"
                fill="url(#stakeGradient2)"
              />

              {/* Rewards Area fill */}
              <path
                d="M 20,190 L 40,185 L 80,175 L 120,165 L 160,150 L 200,140 L 240,130 L 280,125 L 320,120 L 360,115 L 380,110 L 380,200 Z"
                fill="url(#rewardsGradient2)"
              />

              {/* Stake Line */}
              <path
                d="M 20,180 L 40,160 L 80,140 L 120,120 L 160,100 L 200,85 L 240,75 L 280,70 L 320,65 L 360,60 L 380,55"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Rewards Line */}
              <path
                d="M 20,190 L 40,185 L 80,175 L 120,165 L 160,150 L 200,140 L 240,130 L 280,125 L 320,120 L 360,115 L 380,110"
                fill="none"
                stroke="#10B981"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Data points for stake */}
              {[20, 40, 80, 120, 160, 200, 240, 280, 320, 360, 380].map((x, i) => {
                const y = [180, 160, 140, 120, 100, 85, 75, 70, 65, 60, 55][i];
                return (
                  <circle
                    key={`stake-${i}`}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#3B82F6"
                    className="hover:r-6 transition-all duration-200"
                  />
                );
              })}

              {/* Data points for rewards */}
              {[20, 40, 80, 120, 160, 200, 240, 280, 320, 360, 380].map((x, i) => {
                const y = [190, 185, 175, 165, 150, 140, 130, 125, 120, 115, 110][i];
                return (
                  <circle
                    key={`rewards-${i}`}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#10B981"
                    className="hover:r-6 transition-all duration-200"
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* Fan Leaderboard */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Fan Leaderboard</h3>
                <p className="text-gray-600 mt-1">Top supporters staking in your pool</p>
              </div>
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-gray-700">
                  {mockLeaderboard.length} Fans
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stake Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mockLeaderboard.map(fan => (
                  <tr key={fan.rank} className="hover:bg-gray-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            fan.rank === 1
                              ? "bg-yellow-100 text-yellow-700"
                              : fan.rank === 2
                                ? "bg-gray-100 text-gray-700"
                                : fan.rank === 3
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {fan.rank}
                        </span>
                        {fan.rank <= 3 && (
                          <span className="text-lg">
                            {fan.rank === 1 ? "🥇" : fan.rank === 2 ? "🥈" : "🥉"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-3">
                        <img
                          src={fan.avatar}
                          alt={fan.username}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {fan.username}
                            </span>
                            {fan.isVerified && (
                              <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {fan.stakeAmount.toLocaleString()} REVO
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getTierColor(fan.tier)}`}
                      >
                        <span>{getTierIcon(fan.tier)}</span>
                        <span>{fan.tier}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(fan.joinDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Your Reward Pool</h1>
          <p className="text-gray-600">
            Set up a reward pool to engage your community and earn from their stakes
          </p>
        </div>

        <div className="space-y-8">
          {/* Pool Name */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pool Details</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pool Name</label>
              <input
                type="text"
                value={poolName}
                onChange={e => setPoolName(e.target.value)}
                placeholder="Enter your pool name (e.g., 'Creator's VIP Club')"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pool Description
              </label>
              <textarea
                value={poolDescription}
                onChange={e => setPoolDescription(e.target.value)}
                placeholder="Describe your pool and what supporters can expect (e.g., 'Join my exclusive community for behind-the-scenes content, early access to projects, and direct interaction with me.')"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Help potential supporters understand the value of joining your pool
              </p>
            </div>
          </div>

          {/* Pool Image */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Upload className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pool Image</h3>
            </div>

            <div className="flex items-center space-x-6">
              {/* Image Preview */}
              <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                {poolImage ? (
                  <img
                    src={poolImage}
                    alt="Pool preview"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Upload Image</p>
                  </div>
                )}
              </div>

              {/* Upload Button */}
              <div>
                <label className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium cursor-pointer transition-colors duration-200">
                  <Upload className="w-4 h-4" />
                  <span>Choose Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-gray-500 mt-2">Recommended: 400x400px, max 5MB</p>
              </div>
            </div>
          </div>

          {/* Your Stake */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Coins className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Your Initial Stake</h3>
              <div className="group relative">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                    Amount you stake to bootstrap your pool
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                value={yourStake}
                onChange={e => setYourStake(e.target.value)}
                placeholder="1000"
                className="w-full px-4 py-3 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                REVO
              </div>
            </div>
          </div>

          {/* Creator Fee */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Percent className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Creator Fee</h3>
              <div className="group relative">
                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                    Percentage you earn from user stakes
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Fee Percentage</span>
                <span className="text-lg font-semibold text-gray-900">{creatorFee}%</span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={creatorFee}
                  onChange={e => setCreatorFee(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Staking Tiers */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Staking Tiers</h3>
                <div className="group relative">
                  <Info className="w-4 h-4 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                      Set rewards based on stake amounts
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={addTier}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
              >
                <Plus className="w-4 h-4" />
                <span>Add Tier</span>
              </button>
            </div>

            <div className="space-y-4">
              {stakingTiers.map((tier, index) => {
                const IconComponent = tierIcons[index % tierIcons.length]?.icon || Star;
                const iconColor = tierIcons[index % tierIcons.length]?.color || "text-gray-600";

                return (
                  <div key={tier.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`p-2 rounded-lg ${tier.color.replace("text-", "bg-").replace("-700", "-100")}`}
                        >
                          <IconComponent className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <input
                          type="text"
                          value={tier.name}
                          onChange={e => updateTier(tier.id, "name", e.target.value)}
                          className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2"
                        />
                      </div>
                      <button
                        onClick={() => removeTier(tier.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors duration-200"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Minimum Stake
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={tier.minStake}
                            onChange={e => updateTier(tier.id, "minStake", Number(e.target.value))}
                            className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
                            REVO
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Perks & Benefits
                        </label>
                        <button
                          onClick={() => addPerkToTier(tier.id)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Add Perk
                        </button>
                      </div>
                      <div className="space-y-2">
                        {tier.perks.map((perk, perkIndex) => (
                          <div key={perkIndex} className="flex items-center space-x-2">
                            <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <input
                              type="text"
                              value={perk}
                              onChange={e => updatePerk(tier.id, perkIndex, e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {tier.perks.length > 1 && (
                              <button
                                onClick={() => removePerk(tier.id, perkIndex)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors duration-200"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create Pool Button */}
          <div className="flex justify-center pt-6">
            <button
              onClick={handleCreatePool}
              disabled={!poolName || !poolDescription || !yourStake}
              className={`flex items-center space-x-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
                poolName && poolDescription && yourStake
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Save className="w-5 h-5" />
              <span>Create Reward Pool</span>
            </button>
          </div>
        </div>

        <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3B82F6;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #3B82F6;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
      </div>

      {/* Pool Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Sparkles className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Pool Summary</h2>
                  <p className="text-sm text-gray-600">Review your pool details before launching</p>
                </div>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Pool Overview */}
              <div className="flex items-center space-x-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200">
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white shadow-sm bg-gray-100 flex-shrink-0">
                  {poolImage ? (
                    <img
                      src={poolImage}
                      alt="Pool preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                      <Trophy className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {poolName || "Unnamed Pool"}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">
                    {poolDescription || "No description provided"}
                  </p>
                  <p className="text-xs text-gray-500">Reward Pool</p>
                  <div className="flex items-center space-x-4 mt-2 text-sm">
                    <div className="flex items-center space-x-1">
                      <Coins className="w-4 h-4 text-green-600" />
                      <span className="text-gray-700">Initial: {yourStake || "0"} REVO</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Percent className="w-4 h-4 text-orange-600" />
                      <span className="text-gray-700">Fee: {creatorFee}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pool Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Your Initial Stake */}
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Coins className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Your Initial Stake</span>
                  </div>
                  <div className="text-2xl font-bold text-green-900">
                    {yourStake ? `${Number(yourStake).toLocaleString()} REVO` : "0 REVO"}
                  </div>
                  <div className="text-xs text-green-600 mt-1">Bootstraps your pool</div>
                </div>

                {/* Creator Fee */}
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Percent className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium text-orange-700">Creator Fee</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-900">{creatorFee}%</div>
                  <div className="text-xs text-orange-600 mt-1">Your earnings from stakes</div>
                </div>
              </div>

              {/* Staking Tiers */}
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  <h4 className="text-lg font-semibold text-gray-900">Staking Tiers</h4>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                    {stakingTiers.length} tier{stakingTiers.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-3">
                  {stakingTiers.map((tier, index) => {
                    const IconComponent = tierIcons[index % tierIcons.length]?.icon || Star;
                    const iconColor = tierIcons[index % tierIcons.length]?.color || "text-gray-600";

                    return (
                      <div
                        key={tier.id}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div
                              className={`p-2 rounded-lg ${tier.color.replace("text-", "bg-").replace("-700", "-100")}`}
                            >
                              <IconComponent className={`w-4 h-4 ${iconColor}`} />
                            </div>
                            <div>
                              <h5 className="font-semibold text-gray-900">{tier.name}</h5>
                              <p className="text-sm text-gray-600">
                                {tier.minStake.toLocaleString()}+ REVO
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="ml-11">
                          <div className="text-sm text-gray-700">
                            <strong>Perks:</strong>
                          </div>
                          <ul className="text-sm text-gray-600 mt-1 space-y-1">
                            {tier.perks.map((perk, perkIndex) => (
                              <li key={perkIndex} className="flex items-center space-x-2">
                                <Target className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                <span>{perk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Launch Confirmation */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900 mb-1">Ready to Launch</h4>
                    <p className="text-sm text-blue-800">
                      Once launched, your pool will be live and users can start staking. You can
                      modify tiers and perks later, but the initial stake and creator fee cannot be
                      changed.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="w-full sm:w-auto px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
                >
                  Back to Edit
                </button>

                <button
                  onClick={handleLaunchPool}
                  className="w-full sm:w-auto flex items-center justify-center space-x-3 px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Check className="w-5 h-5" />
                  <span>Launch Pool</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Confirmation Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {transactionStep === "confirming" ? (
              // Confirming Transaction Step
              <>
                <div className="p-6 text-center">
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4 animate-pulse">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Confirming Transaction</h3>
                    <p className="text-gray-600">
                      Your reward pool is being created on the blockchain...
                    </p>
                  </div>

                  {/* Transaction Hash */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="text-sm text-gray-500 mb-1">Transaction Hash</div>
                    <div className="font-mono text-xs text-gray-700 break-all">
                      {transactionHash}
                    </div>
                  </div>

                  {/* Progress Animation */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-gray-700">Broadcasting transaction...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
                      <span className="text-gray-500">Waiting for confirmation...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
                      <span className="text-gray-400">Pool deployment...</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              // Transaction Confirmed Step
              <>
                {/* Close Button */}
                <div className="flex justify-end p-4 pb-0">
                  <button
                    onClick={() => {
                      setShowTransactionModal(false);
                      if (transactionStep === "confirmed") {
                        // Handle successful pool creation
                        setHasPool(true);
                        console.log("Pool launched successfully:", {
                          poolName,
                          poolDescription,
                          poolImage,
                          yourStake,
                          creatorFee,
                          stakingTiers,
                          transactionHash,
                        });
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 text-center">
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4 animate-bounce">
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        ></path>
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-green-900 mb-2">
                      Transaction Confirmed!
                    </h3>
                    <p className="text-gray-600">
                      Your reward pool has been successfully created and deployed.
                    </p>
                  </div>

                  {/* Transaction Details */}
                  <div className="bg-green-50 rounded-lg p-4 mb-4 border border-green-200">
                    <div className="text-sm text-green-700 mb-2 font-medium">
                      Pool Created Successfully
                    </div>
                    <div className="text-xs text-green-600">Pool Name: {poolName}</div>
                    <div className="text-xs text-green-600">Initial Stake: {yourStake} REVO</div>
                    <div className="text-xs text-green-600">Creator Fee: {creatorFee}%</div>
                  </div>

                  {/* Block Explorer Link */}
                  <div className="mb-4">
                    <a
                      href={`https://etherscan.io/tx/${transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 text-sm"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        ></path>
                      </svg>
                      <span>View on Block Explorer</span>
                    </a>
                  </div>

                  {/* Success Steps */}
                  <div className="space-y-2 text-left">
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span className="text-green-700">Transaction broadcasted</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span className="text-green-700">Block confirmation received</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <span className="text-green-700">Pool deployed successfully</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
