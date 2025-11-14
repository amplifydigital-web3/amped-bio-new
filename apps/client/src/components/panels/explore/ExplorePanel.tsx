import React, { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, Users, Trophy, Filter, SortDesc, Coins, ChevronDown, X, User } from "lucide-react";
import { getChainConfig } from "@ampedbio/web3";
import PoolDetailsModal from "./ExplorePoolDetailsModal";
// import NFTOverviewModal from './NFTOverviewModal';
import StakingModal from "./StakingModal";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import { useStaking } from "../../../hooks/useStaking";

interface ExplorePageProps {
  initialTab?: "users" | "pools" | "nfts";
  onTabChange?: (tab: "users" | "pools" | "nfts") => void;
}

export interface RewardPool {
  id: number;
  description: string | null;
  chainId: string;
  userId: number;
  poolAddress: string | null;
  image_file_id: number | null;
  imageUrl?: string | null;

  // Placeholder fields for client-side derivation or future server implementation
  title: string; // Keep for backward compatibility
  name: string; // Blockchain pool name (primary)
  totalReward: number;
  stakedAmount: number;
  participants: number;
  createdBy: string;
  earnedRewards: number;
  creatorAddress?: string | null;
}

export default function ExplorePage({ initialTab, onTabChange }: ExplorePageProps) {
  const getInitialTabFromQuery = (): "users" | "pools" | "nfts" => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get("t");

      // Map query parameter values to component tab values
      switch (tabParam) {
        case "users":
          return "users";
        case "pools":
          return "pools";
        case "nfts":
          return "nfts";
        default:
          return initialTab || "users";
      }
    }
    return initialTab || "users";
  };

  const [activeTab, setActiveTab] = useState<"users" | "pools" | "nfts">(getInitialTabFromQuery());
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

  // Hook de staking para o pool selecionado
  const {
    stake: stakeFunction,
    unstake: unstakeFunction,
    isStaking: stakingState,
    stakeActionError: stakingError,
  } = useStaking(selectedStakingPool);
  const [selectedRewardPoolForView, setSelectedRewardPoolForView] = useState<RewardPool | null>(
    null
  );
  const [isRewardPoolViewModalOpen, setIsRewardPoolViewModalOpen] = useState(false);

  const { data: users, isLoading: isLoadingUsers } = useQuery(
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
    users: [
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
    nfts: [
      { value: "popular", label: "Most Popular" },
      { value: "newest", label: "Newest" },
      { value: "price-low", label: "Price: Low to High" },
      { value: "price-high", label: "Price: High to Low" },
      { value: "rarity", label: "Rarity" },
    ],
  };

  const { data: pools, isLoading: isLoadingPools } = useQuery(
    trpc.pools.fan.getPools.queryOptions({
      search: debouncedSearchQuery,
    })
  );

  const handleViewProfile = (username: string) => {
    window.open(`${window.location.origin}/${username}`, "_blank", "noopener,noreferrer");
  };
  const handleJoinPool = (poolId: number) => {
    const pool = pools?.find(p => p.id === poolId);
    if (pool) {
      // Criar um objeto que tenha a estrutura esperada pelo useStaking
      const poolForStaking = {
        id: pool.id,
        title: pool.name, // Use name from blockchain
        name: pool.name, // Include name field as well
        description: pool.description ?? "",
        chainId: pool.chainId,
        poolAddress: pool.poolAddress,
        imageUrl: pool.imageUrl,
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
        title: pool.name, // Use name as title as well
        name: pool.name, // Use name from blockchain
        totalReward: pool.totalReward || 0, // Placeholder
        stakedAmount: pool.stakedAmount || 0, // Add stakedAmount
        participants: pool.participants || 0, // Placeholder
        createdBy: pool.createdBy || "Unknown", // Placeholder
        earnedRewards: 0,
        creatorAddress: pool.creatorAddress, // Add creatorAddress
      };

      setSelectedRewardPoolForView(poolForView);
      setIsRewardPoolViewModalOpen(true);
    }
  };

  const renderUsers = () => {
    if (isLoadingUsers) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <UserSkeleton key={index} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users?.map(user => (
            <div
              key={user.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              {user.banner ? (
                <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative">
                  <img
                    src={user.banner}
                    alt={`${user.displayName} banner`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              ) : (
                <div className="h-24 bg-gradient-to-r from-blue-500 to-purple-600 relative shadow-inner"></div>
              )}

              <div className="p-6 relative">
                <div className="absolute -top-12 left-6">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.displayName}
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
                      <h3 className="font-semibold text-gray-900">{user.displayName}</h3>
                      {user.verified && (
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
                        {user.poolStake.toLocaleString()} Pool Stake
                      </span>
                      <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                          Amount staked to users pool by others
                          <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 mb-2">@{user.username}</p>
                  <div
                    className="text-sm text-gray-600 mb-4 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: user.bio }}
                  />

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleViewProfile(user.username)}
                      className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors duration-200 text-sm"
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // User Skeleton Component
  const UserSkeleton = () => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Banner skeleton */}
      <div className="h-24 bg-gradient-to-r from-blue-200 to-purple-200 relative animate-pulse"></div>

      {/* Profile image skeleton */}
      <div className="p-6 relative">
        <div className="absolute -top-12 left-6">
          <div className="w-16 h-16 rounded-full border-4 border-white shadow-lg bg-gray-300 animate-pulse"></div>
        </div>

        <div className="mt-6">
          {/* Name and verification skeleton */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="h-5 bg-gray-300 rounded w-24 animate-pulse"></div>
              <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse"></div>
            </div>
            <div>
              <div className="h-6 bg-gray-300 rounded-full w-28 animate-pulse"></div>
            </div>
          </div>

          {/* Username skeleton */}
          <div className="h-4 bg-gray-300 rounded w-20 mb-2 animate-pulse"></div>

          {/* Bio skeleton */}
          <div className="space-y-2 mb-4">
            <div className="h-4 bg-gray-300 rounded w-full animate-pulse"></div>
            <div className="h-4 bg-gray-300 rounded w-4/5 animate-pulse"></div>
          </div>

          {/* Action button skeleton */}
          <div className="flex space-x-2">
            <div className="flex-1 py-2 px-3 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );

  // Pool Skeleton Component
  const PoolSkeleton = () => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Image skeleton */}
      <div className="h-32 bg-gradient-to-r from-blue-200 to-purple-200 relative animate-pulse"></div>

      <div className="p-6">
        {/* Title skeleton */}
        <div className="h-5 bg-gray-300 rounded w-3/4 mb-2 animate-pulse"></div>

        {/* Description skeleton */}
        <div className="space-y-2 mb-4">
          <div className="h-4 bg-gray-300 rounded w-full animate-pulse"></div>
          <div className="h-4 bg-gray-300 rounded w-4/5 animate-pulse"></div>
        </div>

        {/* Stats skeleton */}
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-300 rounded w-1/3 animate-pulse"></div>
            <div className="h-4 bg-gray-300 rounded w-1/4 animate-pulse"></div>
          </div>
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-300 rounded w-1/3 animate-pulse"></div>
            <div className="h-4 bg-gray-300 rounded w-1/4 animate-pulse"></div>
          </div>
        </div>

        {/* Badge skeleton */}
        <div className="absolute top-2 right-2">
          <div className="h-6 w-16 bg-gray-300 rounded-full animate-pulse"></div>
        </div>

        {/* Action buttons skeleton */}
        <div className="flex space-x-2">
          <div className="flex-1 py-2 px-3 bg-gray-200 rounded-lg animate-pulse"></div>
          <div className="flex-1 py-2 px-3 bg-blue-200 rounded-lg animate-pulse"></div>
        </div>
      </div>
    </div>
  );

  const renderPools = () => {
    if (isLoadingPools) {
      return (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <PoolSkeleton key={index} />
            ))}
          </div>
        </div>
      );
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
              {pool.imageUrl ? (
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 relative overflow-hidden">
                  <img
                    src={pool.imageUrl}
                    alt={pool.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-20"></div>
                </div>
              ) : (
                <div className="h-32 bg-gray-200" />
              )}

              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {pool.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {pool.description ?? "No description available."}
                </p>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total Stake</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.stakedAmount ?? 0).toLocaleString()}{" "}
                      {getChainConfig(parseInt(pool.chainId))?.nativeCurrency.symbol || "REVO"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Participants</span>
                    <span className="font-semibold text-gray-900">
                      {(pool.participants ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                <span className="absolute top-2 right-2 inline-flex items-center rounded-full border border-blue-400 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  New
                </span>

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
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-1 bg-blue-600 text-white hover:bg-blue-700`}
                  >
                    <Coins className="w-4 h-4" />
                    <span>Stake</span>
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
        <div className="flex flex-col md:flex-row md::items-center md:justify-between space-y-4 md:space-y-0">
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
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${sortBy === option.value ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                setActiveTab("users");
                onTabChange?.("users");
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "users"
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
            <button
              onClick={() => {
                setActiveTab("nfts");
                onTabChange?.("nfts");
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm relative group ${
                activeTab === "nfts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400"
              } ${activeTab !== "nfts" ? "hover:text-gray-700 hover:border-gray-300" : ""}`}
            >
              <div className="flex items-center space-x-2">
                <span>NFTs</span>
              </div>
              {activeTab !== "nfts" && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap">
                    Coming Soon
                  </div>
                </div>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen">
        {activeTab === "users" && renderUsers()}
        {activeTab === "pools" && renderPools()}
        {activeTab === "nfts" && (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-4">NFTs exploration feature coming soon.</div>
            <div className="text-sm text-gray-400">
              This section will display available NFTs once implemented.
            </div>
          </div>
        )}
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
        onStake={stakeFunction}
        onUnstake={unstakeFunction}
        isStaking={stakingState}
        stakeActionError={stakingError}
      />
    </div>
  );
}
