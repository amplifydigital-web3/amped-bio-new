import React, { useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, Trophy, Filter, SortDesc, ChevronDown, Users, Coins } from "lucide-react";
import PoolDetailsModal from "./ExplorePoolDetailsModal";
// import NFTOverviewModal from './NFTOverviewModal';
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import UsersTab from "./components/UsersTab";
import PoolsTab from "./components/PoolsTab";

// Define filter types
type UserFilter = "all" | "active-7-days" | "has-creator-pool" | "has-stake-in-pool";
type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
type UserSort = "newest" | "name-asc" | "name-desc" | "stake-desc";
type PoolSort = "newest" | "name-asc" | "name-desc";

interface ExplorePageProps {
  initialTab?: "users" | "pools" | "nfts";
  onTabChange?: (tab: "users" | "pools" | "nfts") => void;
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

  // Filter and sort states
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [poolFilter, setPoolFilter] = useState<PoolFilter>("all");
  const [userSort, setUserSort] = useState<UserSort>("newest");
  const [poolSort, setPoolSort] = useState<PoolSort>("newest");

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedCreatorPool, setSelectedCreatorPool] = useState<any>(null);
  const [isCreatorPoolModalOpen, setIsCreatorPoolModalOpen] = useState(false);

  const { data: users, isLoading: isLoadingUsers } = useQuery(
    trpc.user.getUsers.queryOptions({ search: debouncedSearchQuery })
  );

  // Sort options
  const sortOptions = {
    users: [
      { value: "newest", label: "Newest First" },
      { value: "name-asc", label: "Name A-Z" },
      { value: "name-desc", label: "Name Z-A" },
      { value: "stake-desc", label: "Stake Amount" },
    ],
    pools: [
      { value: "newest", label: "Newest First" },
      { value: "name-asc", label: "Name A-Z" },
      { value: "name-desc", label: "Name Z-A" },
    ],
    nfts: [
      { value: "popular", label: "Most Popular" },
      { value: "newest", label: "Newest" },
      { value: "price-low", label: "Price: Low to High" },
      { value: "price-high", label: "Price: High to Low" },
      { value: "rarity", label: "Rarity" },
    ],
  };

  const handleViewProfile = (username: string) => {
    window.open(`${window.location.origin}/${username}`, "_blank", "noopener,noreferrer");
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
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <Filter className="w-4 h-4" />
                <span>Filter</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isFilterOpen && (
                <div className="relative">
                  <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-2 text-sm font-medium text-gray-700 border-b border-gray-200">
                      {activeTab === "users" ? "User Filters" : "Pool Filters"}
                    </div>
                    {/* User filters */}
                    {activeTab === "users" && (
                      <>
                        <button
                          onClick={() => {
                            setUserFilter("active-7-days");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            userFilter === "active-7-days"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700"
                          }`}
                        >
                          Active in last 7 days
                          {userFilter === "active-7-days" && <span className="float-right">✓</span>}
                        </button>
                        <button
                          onClick={() => {
                            setUserFilter("has-creator-pool");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            userFilter === "has-creator-pool"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700"
                          }`}
                        >
                          Has creator pool
                          {userFilter === "has-creator-pool" && (
                            <span className="float-right">✓</span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setUserFilter("has-stake-in-pool");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            userFilter === "has-stake-in-pool"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700"
                          }`}
                        >
                          Has stake in pool
                          {userFilter === "has-stake-in-pool" && (
                            <span className="float-right">✓</span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setUserFilter("all");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            userFilter === "all" ? "bg-blue-50 text-blue-700" : "text-gray-700"
                          }`}
                        >
                          All users
                          {userFilter === "all" && <span className="float-right">✓</span>}
                        </button>
                      </>
                    )}
                    {/* Pool filters */}
                    {activeTab === "pools" && (
                      <>
                        <button
                          onClick={() => {
                            setPoolFilter("no-fans");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            poolFilter === "no-fans" ? "bg-blue-50 text-blue-700" : "text-gray-700"
                          }`}
                        >
                          Pools with no fans
                          {poolFilter === "no-fans" && <span className="float-right">✓</span>}
                        </button>
                        <button
                          onClick={() => {
                            setPoolFilter("more-than-10-fans");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            poolFilter === "more-than-10-fans"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700"
                          }`}
                        >
                          Pools with more than 10 fans
                          {poolFilter === "more-than-10-fans" && (
                            <span className="float-right">✓</span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setPoolFilter("more-than-10k-stake");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            poolFilter === "more-than-10k-stake"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-700"
                          }`}
                        >
                          Pools with more than 10k REVO in stake
                          {poolFilter === "more-than-10k-stake" && (
                            <span className="float-right">✓</span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setPoolFilter("all");
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${
                            poolFilter === "all" ? "bg-blue-50 text-blue-700" : "text-gray-700"
                          }`}
                        >
                          All pools
                          {poolFilter === "all" && <span className="float-right">✓</span>}
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
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <SortDesc className="w-4 h-4" />
                <span>Sort</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${isSortOpen ? "rotate-180" : ""}`}
                />
              </button>
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
                          if (activeTab === "users") {
                            setUserSort(option.value as UserSort);
                          } else if (activeTab === "pools") {
                            setPoolSort(option.value as PoolSort);
                          }
                          setIsSortOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors duration-200 ${(activeTab === "users" && option.value === userSort) || (activeTab === "pools" && option.value === poolSort) ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
                      >
                        {option.label}
                        {(activeTab === "users" && option.value === userSort) ||
                        (activeTab === "pools" && option.value === poolSort) ? (
                          <span className="float-right">✓</span>
                        ) : null}
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
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "nfts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center space-x-2">
                <Coins className="w-4 h-4" />
                <span>NFTs</span>
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mb-12">
        {activeTab === "users" && (
          <UsersTab
            searchQuery={debouncedSearchQuery}
            userFilter={userFilter}
            userSort={userSort}
            handleViewProfile={handleViewProfile}
          />
        )}
        {activeTab === "pools" && (
          <PoolsTab
            searchQuery={debouncedSearchQuery}
            poolFilter={poolFilter}
            poolSort={poolSort}
          />
        )}
        {activeTab === "nfts" && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Coins className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 mb-2">NFTs Coming Soon</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              We're working on bringing you NFT discovery and trading. Check back later!
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {isCreatorPoolModalOpen && selectedCreatorPool && (
        <PoolDetailsModal
          poolId={selectedCreatorPool.id}
          isOpen={isCreatorPoolModalOpen}
          onClose={() => {
            setIsCreatorPoolModalOpen(false);
            setSelectedCreatorPool(null);
          }}
        />
      )}
    </div>
  );
}
