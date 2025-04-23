import React from "react";
import { LayoutGrid, List, Search } from "lucide-react";

interface MarketplaceHeaderProps {
  view: "grid" | "list";
  filter: string;
  sort: "popular" | "newest" | "rating";
  onViewChange: (view: "grid" | "list") => void;
  onFilterChange: (filter: string) => void;
  onSortChange: (sort: "popular" | "newest" | "rating") => void;
}

export function MarketplaceHeader({
  view,
  filter,
  sort,
  onViewChange,
  onFilterChange,
  onSortChange,
}: MarketplaceHeaderProps) {
  return (
    <div className="p-6 border-b border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Theme Marketplace</h2>
          <p className="text-sm text-gray-500">Browse and apply beautiful themes to your profile</p>
        </div>
      </div>

      {/* <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Search themes..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as 'popular' | 'newest' | 'rating')}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
          <option value="rating">Top Rated</option>
        </select>
      </div> */}
    </div>
  );
}
