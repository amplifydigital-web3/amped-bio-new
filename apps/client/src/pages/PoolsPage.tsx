import React, { useState } from "react";
import { Search } from "lucide-react";
import PoolsTab from "../components/panels/explore/components/PoolsTab";

const PoolsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [poolFilter, setPoolFilter] = useState<
    "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake"
  >("all");
  const [poolSort, setPoolSort] = useState<
    "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked"
  >("newest");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pools</h1>
        <p className="text-gray-600">Discover and join pools in the community</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search pools..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={poolFilter}
              onChange={e => setPoolFilter(e.target.value as any)}
            >
              <option value="all">All Pools</option>
              <option value="no-fans">No Fans</option>
              <option value="more-than-10-fans">More than 10 Fans</option>
              <option value="more-than-10k-stake">More than 10k Stake</option>
            </select>

            <select
              className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={poolSort}
              onChange={e => setPoolSort(e.target.value as any)}
            >
              <option value="newest">Newest</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="most-fans">Most Fans</option>
              <option value="most-staked">Most Staked</option>
            </select>
          </div>
        </div>
      </div>

      <PoolsTab searchQuery={searchQuery} poolFilter={poolFilter} poolSort={poolSort} />
    </div>
  );
};

export default PoolsPage;
