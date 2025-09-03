import React, { useState } from "react";
import { Search, Users, Trophy, Filter, SortDesc, Coins, ChevronDown, X } from "lucide-react";
import PoolDetailsModal from "./PoolDetailsModal";
// import NFTOverviewModal from './NFTOverviewModal';
import StakingModal from "./StakingModal";

interface ExplorePageProps {
  initialTab?: "creators" | "pools";
  onTabChange?: (tab: "creators" | "pools") => void;
}

interface Creator {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  banner: string;
  followers: number;
  following: number;
  verified: boolean;
  bio: string;
  totalEarnings: number;
  poolStake: number;
  category: string;
}

interface RewardPool {
  id: string;
  title: string;
  description: string;
  totalReward: number;
  currency: string;
  participants: number;
  maxParticipants: number;
  endDate: string;
  status: "active" | "ending-soon" | "completed";
  category: "staking" | "social" | "trading" | "community";
  createdBy: string;
  image?: string;
  stakedAmount: number;
  stakeCurrency: string;
  rewardCurrency: string;
  earnedRewards: number;
  estimatedRewards: number;
}

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState<"creators" | "pools">("creators");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedCreatorPool, setSelectedCreatorPool] = useState<any>(null);
  const [isCreatorPoolModalOpen, setIsCreatorPoolModalOpen] = useState(false);

  const [selectedStakingPool, setSelectedStakingPool] = useState<any>(null);
  const [isStakingModalOpen, setIsStakingModalOpen] = useState(false);
  const [stakingMode, setStakingMode] = useState<"stake" | "add-stake">("stake");
  const [selectedRewardPoolForView, setSelectedRewardPoolForView] = useState<RewardPool | null>(
    null
  );
  const [isRewardPoolViewModalOpen, setIsRewardPoolViewModalOpen] = useState(false);

  // Filter categories
  const categories = [
    "All",
    "Gaming",
    "Music",
    "Art & Design",
    "Storytelling",
    "Collectibles",
    "Memberships",
    "Education",
    "Lifestyle",
    "Podcasts",
  ];

  // Sort options
  const sortOptions = {
    creators: [
      { value: "popular", label: "Most Popular" },
      { value: "followers", label: "Most Followers" },
      { value: "pool-stake", label: "Pool Stake" },
      { value: "earnings", label: "Highest Earnings" },
      { value: "newest", label: "Newest" },
    ],
    pools: [
      { value: "popular", label: "Most Popular" },
      { value: "participants", label: "Most Participants" },
      { value: "reward", label: "Highest Reward" },
      { value: "ending-soon", label: "Ending Soon" },
      { value: "newest", label: "Newest" },
    ],
  };

  // Mock data for creators
  const mockCreators: Creator[] = [
    {
      id: "1",
      username: "cryptoartist.eth",
      displayName: "CryptoArtist",
      avatar:
        "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=200",
      banner:
        "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=800",
      followers: 15420,
      following: 892,
      verified: true,
      bio: "Digital artist creating unique NFT collections. Exploring the intersection of art and technology.",
      totalEarnings: 46,
      poolStake: 127000,
      category: "Art & Design",
    },
    {
      id: "2",
      username: "nftcollector",
      displayName: "NFT Collector Pro",
      avatar:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=200",
      banner:
        "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=800",
      followers: 8934,
      following: 1247,
      verified: false,
      bio: "Passionate NFT collector and trader. Always looking for the next big thing in digital art.",
      totalEarnings: 23,
      poolStake: 89500,
      category: "Collectibles",
    },
    {
      id: "3",
      username: "metaverse.builder",
      displayName: "Metaverse Builder",
      avatar:
        "https://images.pexels.com/photos/1181263/pexels-photo-1181263.jpeg?auto=compress&cs=tinysrgb&w=200",
      banner:
        "https://images.pexels.com/photos/1181244/pexels-photo-1181244.jpeg?auto=compress&cs=tinysrgb&w=800",
      followers: 12567,
      following: 456,
      verified: true,
      bio: "Building the future of virtual worlds. Creating immersive experiences in the metaverse.",
      totalEarnings: 67,
      poolStake: 203750,
      category: "Gaming",
    },
    {
      id: "4",
      username: "music.producer",
      displayName: "Beat Master",
      avatar:
        "https://images.pexels.com/photos/1181248/pexels-photo-1181248.jpeg?auto=compress&cs=tinysrgb&w=200",
      banner:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=800",
      followers: 7823,
      following: 234,
      verified: true,
      bio: "Electronic music producer creating beats for the metaverse. Exclusive tracks for supporters.",
      totalEarnings: 34,
      poolStake: 65400,
      category: "Music",
    },
    {
      id: "5",
      username: "story.teller",
      displayName: "Digital Storyteller",
      avatar:
        "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=200",
      banner:
        "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=800",
      followers: 5432,
      following: 678,
      verified: false,
      bio: "Interactive storyteller crafting immersive narratives. Join my world of digital adventures.",
      totalEarnings: 19,
      poolStake: 42300,
      category: "Storytelling",
    },
  ];

  // Mock data for reward pools
  const mockPools: RewardPool[] = [
    {
      id: "1",
      title: "REVO Staking Champions",
      description:
        "Stake 1000+ REVO tokens for 30 days and earn bonus rewards based on your staking duration.",
      totalReward: 50000,
      currency: "REVO",
      participants: 247,
      maxParticipants: 500,
      endDate: "2025-02-15",
      status: "active",
      category: "staking",
      createdBy: "Amped.Bio Team",
      image:
        "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=400",
      stakedAmount: 1000,
      stakeCurrency: "REVO",
      rewardCurrency: "REVO",
      earnedRewards: 0,
      estimatedRewards: 500,
    },
    {
      id: "2",
      title: "Social Media Engagement",
      description:
        "Share your profile, refer friends, and engage with the community to earn exclusive NFT rewards.",
      totalReward: 25,
      currency: "NFTs",
      participants: 892,
      maxParticipants: 1000,
      endDate: "2025-01-31",
      status: "active",
      category: "social",
      createdBy: "Community DAO",
      image:
        "https://images.pexels.com/photos/1181467/pexels-photo-1181467.jpeg?auto=compress&cs=tinysrgb&w=400",
      stakedAmount: 0,
      stakeCurrency: "",
      rewardCurrency: "NFTs",
      earnedRewards: 0,
      estimatedRewards: 0,
    },
    {
      id: "3",
      title: "Trading Volume Challenge",
      description: "Achieve $10,000+ in trading volume this month and win ETH prizes.",
      totalReward: 10,
      currency: "ETH",
      participants: 156,
      maxParticipants: 200,
      endDate: "2025-01-31",
      status: "active",
      category: "trading",
      createdBy: "TradingPro",
      image:
        "https://images.pexels.com/photos/730547/pexels-photo-730547.jpeg?auto=compress&cs=tinysrgb&w=400",
      stakedAmount: 0,
      stakeCurrency: "",
      rewardCurrency: "ETH",
      earnedRewards: 0,
      estimatedRewards: 0,
    },
  ];

  const handleViewProfile = (_creatorId: string) => {
    window.open("https://amped.bio", "_blank", "noopener,noreferrer");
  };

  const handleStakeToCreator = (creatorId: string) => {
    const creator = mockCreators.find(c => c.id === creatorId);
    if (creator) {
      // Convert creator to pool format for the pool details modal
      const creatorPool = {
        id: `creator-pool-${creator.id}`,
        title: `${creator.displayName}'s Creator Pool`,
        description: `${creator.bio} Join ${creator.displayName}'s exclusive creator pool to support their work and earn rewards based on their success. Stake REVO tokens to unlock different tiers of benefits including exclusive content, early access, and community perks.`,
        stakedAmount: 0, // User's stake in this pool
        stakeCurrency: "REVO",
        totalReward: creator.poolStake,
        rewardCurrency: "REVO",
        endDate: "2025-06-15",
        status: "active" as const,
        category: "staking" as const,
        earnedRewards: 0,
        estimatedRewards: 0,
        participants: creator.poolStake > 0 ? Math.floor(creator.poolStake / 1000) : 1,
        image: creator.banner,
        currency: "REVO", // Added missing property
        maxParticipants: 10000, // Added missing property
        createdBy: creator.displayName, // Added missing property
      };

      setSelectedRewardPoolForView(creatorPool);
      setIsRewardPoolViewModalOpen(true);
    }
  };

  const handleJoinPool = (poolId: string) => {
    const pool = mockPools.find(p => p.id === poolId);
    if (pool) {
      // Convert RewardPool to the format expected by StakingModal
      const poolForStaking = {
        id: pool.id,
        title: pool.title,
        description: pool.description,
        stakeCurrency: "REVO",
        image: pool.image,
        minStake: 500,
        currentStake: 0,
      };

      setSelectedStakingPool(poolForStaking);
      setStakingMode("stake");
      setIsStakingModalOpen(true);
    }
  };

  const handleViewPool = (poolId: string) => {
    const pool = mockPools.find(p => p.id === poolId);
    if (pool) {
      // Convert RewardPool to the format expected by PoolDetailsModal
      const poolForView = {
        ...pool,
        stakedAmount: 0, // User's stake in this pool
        stakeCurrency: "REVO",
        earnedRewards: 0,
        estimatedRewards: 0,
      };

      setSelectedRewardPoolForView(poolForView);
      setIsRewardPoolViewModalOpen(true);
    }
  };

  const renderCreators = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockCreators.map(creator => (
          <div
            key={creator.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            {/* Banner */}
            <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative">
              <img
                src={creator.banner}
                alt={`${creator.displayName} banner`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black bg-opacity-20"></div>
            </div>

            {/* Profile Content */}
            <div className="p-6 relative">
              {/* Avatar */}
              <div className="absolute -top-12 left-6">
                <img
                  src={creator.avatar}
                  alt={creator.displayName}
                  className="w-16 h-16 rounded-full border-4 border-white shadow-lg object-cover"
                />
              </div>

              {/* Creator Info */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-gray-900">{creator.displayName}</h3>
                    {creator.verified && (
                      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
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
                    )}
                  </div>
                  <div className="relative group">
                    <span className="px-2 py-1 rounded-full text-xs font-medium cursor-help bg-gray-100 text-gray-700">
                      {creator.poolStake.toLocaleString()} Pool Stake
                    </span>

                    {/* Tooltip */}
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                        Amount staked to users pool by others
                        <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mb-2">@{creator.username}</p>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{creator.bio}</p>

                {/* Stats */}
                {/* Follow Button */}
                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewProfile(creator.id)}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={() => handleStakeToCreator(creator.id)}
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1 text-sm"
                  >
                    <Coins className="w-4 h-4" />
                    <span>Stake</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPools = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockPools.map(pool => (
          <div
            key={pool.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            {pool.image && (
              <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                <img src={pool.image} alt={pool.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black bg-opacity-20"></div>
              </div>
            )}

            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{pool.title}</h3>
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">{pool.description}</p>

              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Total Stake</span>
                  <span className="font-semibold text-gray-900">
                    {pool.totalReward.toLocaleString()} {pool.currency}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Participants</span>
                  <span className="font-semibold text-gray-900">
                    {pool.participants.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handleViewPool(pool.id)}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1"
                >
                  <Users className="w-4 h-4" />
                  <span>View Pool</span>
                </button>

                <button
                  onClick={() => handleJoinPool(pool.id)}
                  disabled={pool.status === "completed"}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1 ${
                    pool.status === "completed"
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : pool.status === "active"
                        ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  <span>
                    {pool.status === "completed"
                      ? "Ended"
                      : pool.status === "active"
                        ? "Soon"
                        : "Stake"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Explore</h1>
        <p className="text-gray-600">Discover creators, reward pools, and NFTs in the community</p>
      </div>

      {/* Search and Filters */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center space-x-3">
            {/* Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsFilterOpen(!isFilterOpen);
                  setIsSortOpen(false);
                }}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isFilterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                      Filter by Category
                    </div>
                    {categories.map(category => (
                      <button
                        key={category}
                        onClick={() => {
                          setSelectedCategory(category.toLowerCase());
                          setIsFilterOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                          selectedCategory === category.toLowerCase()
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        {category}
                        {selectedCategory === category.toLowerCase() && (
                          <span className="float-right">✓</span>
                        )}
                      </button>
                    ))}
                    {selectedCategory !== "all" && (
                      <>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                          onClick={() => {
                            setSelectedCategory("all");
                            setIsFilterOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200"
                        >
                          <X className="w-3 h-3 inline mr-2" />
                          Clear Filter
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsSortOpen(!isSortOpen);
                  setIsFilterOpen(false);
                }}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <SortDesc className="w-4 h-4" />
                <span>Sort</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSortOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isSortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-100">
                      Sort by
                    </div>
                    {sortOptions[activeTab].map(option => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortBy(option.value);
                          setIsSortOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                          sortBy === option.value ? "bg-blue-50 text-blue-700" : "text-gray-700"
                        }`}
                      >
                        {option.label}
                        {sortBy === option.value && <span className="float-right">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("creators")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "creators"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Users</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab("pools")}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "pools"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Trophy className="w-4 h-4" />
                <span>Reward Pools</span>
              </div>
            </button>
            <div className="relative group">
              <button
                disabled
                className="py-2 px-1 border-b-2 font-medium text-sm border-transparent text-gray-400 cursor-not-allowed"
              >
                <div className="flex items-center space-x-2">
                  <span>NFTs</span>
                </div>
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                  Coming Soon
                </div>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen">
        {activeTab === "creators" && renderCreators()}
        {activeTab === "pools" && renderPools()}
      </div>

      {/* Creator Pool Modal */}
      {selectedCreatorPool && (
        <PoolDetailsModal
          isOpen={isCreatorPoolModalOpen}
          onClose={() => {
            setIsCreatorPoolModalOpen(false);
            setSelectedCreatorPool(null);
          }}
          pool={selectedCreatorPool}
        />
      )}

      {/* Reward Pool Modal */}
      {selectedRewardPoolForView && (
        <PoolDetailsModal
          isOpen={isRewardPoolViewModalOpen}
          onClose={() => {
            setIsRewardPoolViewModalOpen(false);
            setSelectedRewardPoolForView(null);
          }}
          pool={selectedRewardPoolForView}
        />
      )}

      {/* Staking Modal */}
      <StakingModal
        isOpen={isStakingModalOpen}
        onClose={() => {
          setIsStakingModalOpen(false);
          setSelectedStakingPool(null);
        }}
        pool={selectedStakingPool}
        mode={stakingMode}
      />
    </div>
  );
}

interface RewardPool {
  id: string;
  title: string;
  description: string;
  totalReward: number;
  currency: string;
  participants: number;
  maxParticipants: number;
  endDate: string;
  status: "active" | "ending-soon" | "completed";
  category: "staking" | "social" | "trading" | "community";
  createdBy: string;
  image?: string;
}
