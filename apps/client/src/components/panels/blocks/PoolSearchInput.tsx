import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { trpc } from "@/utils/trpc";
import type { PoolSearchResult } from "@ampedbio/constants";

interface PoolSearchInputProps {
  onPoolSelect: (pool: PoolSearchResult) => void;
  currentAddress?: string;
  currentLabel?: string;
  chainId: string;
}

export function PoolSearchInput({
  onPoolSelect,
  currentAddress,
  currentLabel,
  chainId,
}: PoolSearchInputProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  const { data: pools, isLoading, error } = useQuery({
    ...trpc.pools.fan.searchPoolsForBlockEditor.queryOptions({
      chainId,
      search: debouncedSearchQuery.length >= 2 ? debouncedSearchQuery : "",
      limit: 3,
    }),
    enabled: debouncedSearchQuery.length >= 2,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (pool: PoolSearchResult) => {
    onPoolSelect(pool);
    setIsOpen(false);
    setSearchQuery("");
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const hasSelection = currentAddress && currentLabel;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Search pool by name or address"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Current Selection Display */}
      {hasSelection && (
        <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-900">
            Selected: {currentLabel}
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Address: {currentAddress}
          </p>
        </div>
      )}

      {/* Dropdown Results */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-auto">
          {debouncedSearchQuery.length < 2 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Type at least 2 characters to search
            </div>
          ) : isLoading ? (
            <div className="p-4 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-500 text-sm">
              Failed to search pools. Please try again.
            </div>
          ) : pools && pools.length > 0 ? (
            pools.map(pool => (
              <div
                key={pool.id}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => handleSelect(pool)}
              >
                {/* Creator handle and fans */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900">
                    @{pool.creatorHandle || "unknown"}
                  </span>
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="w-3 h-3 mr-1" />
                    {pool.fans} {pool.fans === 1 ? "fan" : "fans"}
                  </div>
                </div>

                {/* Pool name */}
                <p className="text-sm font-medium text-gray-800">
                  {pool.name}
                </p>

                {/* Pool address */}
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  {truncateAddress(pool.address)}
                </p>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">
              No pools found. Try a different search term.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
