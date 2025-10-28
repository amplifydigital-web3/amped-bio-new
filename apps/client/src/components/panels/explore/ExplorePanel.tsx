import React, { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, Users, Trophy, Filter, SortDesc, Coins, ChevronDown, X, User } from "lucide-react";
import PoolDetailsModal from "./PoolDetailsModal";
// import NFTOverviewModal from './NFTOverviewModal';
import StakingModal from "./StakingModal";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";

interface ExplorePageProps {
  initialTab?: "creators" | "pools";
  onTabChange?: (tab: "creators" | "pools") => void;
}

interface Creator {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  banner: string | null;
  followers: number;
  following: number;
  verified: boolean;
  bio: string;
  totalEarnings: number;
  poolStake: number;
  category: string;
}

interface RewardPool {
  id: number;
  description: string | null;
  chainId: string;
  userId: number;
  poolAddress: string | null;
  image_file_id: number | null;
  imageUrl?: string | null;
  // Placeholder fields for client-side derivation or future server implementation
  title: string;
  totalReward: number;
  currency: string;
  participants: number;
  maxParticipants: number;
  endDate: string;
  status: "active" | "ending-soon" | "completed";
  category: "staking" | "social" | "trading" | "community";
  createdBy: string;
  stakedAmount: number;
  stakeCurrency: string;
  rewardCurrency: string;
  earnedRewards: number;
  estimatedRewards: number;
}

export default function ExplorePage({ initialTab = "creators", onTabChange }: ExplorePageProps) {
  const [activeTab, setActiveTab] = useState<"creators" | "pools">(initialTab);
  const [rawSearchQuery, setRawSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(rawSearchQuery, 500);
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

  const { data: creators } = useQuery(
    trpc.user.getUsers.queryOptions({ search: debouncedSearchQuery })
  );

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

  const { data: pools, isLoading: isLoadingPools } = useQuery(
    trpc.pools.getPools.queryOptions({
      search: debouncedSearchQuery,
    })
  );

  const handleViewProfile = (username: string) => {
    window.open(`${window.location.origin}/${username}`, "_blank", "noopener,noreferrer");
  };

  const handleStakeToCreator = (creatorId: string) => {
    const creator = creators?.find(c => c.id === creatorId);
    if (creator) {
      const creatorPool: RewardPool = {
        id: parseInt(creator.id), // Convert creator.id to number
        title: `${creator.displayName}'s Creator Pool`,
        description: `${creator.bio} Join ${creator.displayName}'s exclusive creator pool to support their work and earn rewards based on their success. Stake REVO tokens to unlock different tiers of benefits including exclusive content, early access, and community perks.`,
        stakedAmount: 0,
        stakeCurrency: "REVO",
        totalReward: creator.poolStake,
        rewardCurrency: "REVO",
        endDate: "2025-06-15",
        status: "active" as const,
        category: "staking" as const,
        earnedRewards: 0,
        estimatedRewards: 0,
        participants: creator.poolStake > 0 ? Math.floor(creator.poolStake / 1000) : 1,
        imageUrl: creator.banner, // Use imageUrl instead of image
        currency: "REVO",
        maxParticipants: 10000,
        createdBy: creator.displayName,
        chainId: "", // Default value
        userId: 0, // Default value
        poolAddress: null, // Default value
        image_file_id: null, // Default value
      };
      setSelectedRewardPoolForView(creatorPool);
      setIsRewardPoolViewModalOpen(true);
    }
  };

  const handleJoinPool = (poolId: number) => {
    const pool = pools?.find(p => p.id === poolId);
    if (pool) {
      const poolForStaking = {
        id: pool.id,
        title: pool.title,
        description: pool.description ?? "",
        stakeCurrency: "REVO",
        image: pool.imageUrl,
        minStake: 500,
        currentStake: 0,
      };

      setSelectedStakingPool(poolForStaking);
      setStakingMode("stake");
      setIsStakingModalOpen(true);
    }
  };

  const handleViewPool = (poolId: number) => {
    const pool = pools?.find(p => p.id === poolId);
    if (pool) {
      const poolForView: RewardPool = {
        id: pool.id,
        description: pool.description,
        chainId: pool.chainId,
        userId: pool.walletId, // Use walletId instead of userId since pools now relate to wallets
        poolAddress: pool.poolAddress,
        image_file_id: pool.image_file_id,
        imageUrl: pool.imageUrl,
        title: pool.title || "Untitled Pool", // Placeholder
        totalReward: pool.totalReward || 0, // Placeholder
        currency: pool.currency || "REVO", // Placeholder
        participants: pool.participants || 0, // Placeholder
        maxParticipants: pool.maxParticipants || 0, // Placeholder
        endDate: pool.endDate || "", // Placeholder
        status: (pool.status || "active") as "active" | "ending-soon" | "completed", // Placeholder
        category: (pool.category || "staking") as "staking" | "social" | "trading" | "community", // Placeholder
        createdBy: pool.createdBy || "Unknown", // Placeholder
        stakedAmount: 0,
        stakeCurrency: "REVO",
        rewardCurrency: pool.rewardCurrency || "REVO",
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
        {creators?.map(creator => (
          <div
            key={creator.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
          >
            {creator.banner ? (
              <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative">
                <img
                  src={creator.banner}
                  alt={`${creator.displayName} banner`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black bg-opacity-20"></div>
              </div>
            ) : (
              <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative shadow-inner"></div>
            )}

            <div className="p-6 relative">
              <div className="absolute -top-12 left-6">
                {creator.avatar ? (
                  <img
                    src={creator.avatar}
                    alt={creator.displayName}
                    className="w-16 h-16 rounded-full border-4 border-white shadow-lg object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg object-cover flex items-center justify-center bg-gray-200 text-gray-500">
                    <User className="w-8 h-8" />
                  </div>
                )}
              </div>

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
                    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                        Amount staked to users pool by others
                        <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mb-2">@{creator.username}</p>
                <div
                  className="text-sm text-gray-600 mb-4 line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: creator.bio }}
                />

                <div className="flex space-x-2">
                  <button
                    onClick={() => handleViewProfile(creator.username)}
                    className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={() => handleStakeToCreator(creator.id)}
                    disabled
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

  const renderPools = () => {
    if (isLoadingPools) {
      return <div className="text-center py-8">Loading reward pools...</div>;
    }

    if (!pools || pools.length === 0) {
      return <div className="text-center py-8 text-gray-500">No reward pools found.</div>;
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pools.map(pool => (
            <div
              key={pool.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {pool.imageUrl && (
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                  <img
                    src={pool.imageUrl}
                    alt={pool.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              )}

              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {pool.title ?? "Untitled Pool"}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {pool.description ?? "No description available."}
                </p>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total Stake</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.totalReward ?? 0).toLocaleString()} {pool.currency ?? "REVO"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Participants</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.participants ?? 0).toLocaleString()}
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
                    disabled={(pool.status ?? "active") === "completed"}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1 ${
                      (pool.status ?? "active") === "completed"
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : (pool.status ?? "active") === "active"
                          ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    <Coins className="w-4 h-4" />
                    <span>
                      {(pool.status ?? "active") === "completed"
                        ? "Ended"
                        : (pool.status ?? "active") === "active"
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
  };
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
              value={rawSearchQuery}
              onChange={e => setRawSearchQuery(e.target.value)}
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
                disabled
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-400 cursor-not-allowed"
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                  Coming Soon
                </div>
              </div>
              {isFilterOpen && (
                <div className="relative">
                  <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-200">
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
                        <div className="border-t border-gray-200 my-1"></div>
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
                </div>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsSortOpen(!isSortOpen);
                  setIsFilterOpen(false);
                }}
                disabled
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-400 cursor-not-allowed"
              >
                <SortDesc className="w-4 h-4" />
                <span>Sort</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSortOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                  Coming Soon
                </div>
              </div>
              {isSortOpen && (
                <div className="relative">
                  <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-200">
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
                </div>
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
              onClick={() => {
                setActiveTab("creators");
                onTabChange?.("creators");
              }}
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
              onClick={() => {
                setActiveTab("pools");
                onTabChange?.("pools");
              }}
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
