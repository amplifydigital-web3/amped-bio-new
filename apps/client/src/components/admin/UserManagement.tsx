import { useState, useCallback } from "react";
import { trpc } from "../../utils/trpc";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { formatUserRole, formatUserStatus, formatDate } from "../../utils/adminFormat";

// Schema for search query validation
const searchQuerySchema = z.union([
  z.literal(""), // Empty string is allowed
  z.string().min(2, "Search query must be at least 2 characters").max(50, "Search query is too long")
]);

type User = {
  id: number;
  name: string;
  email: string;
  onelink: string | null;
  role: string;
  block: string;
  image: string | null;
  created_at: string;
  _count: {
    blocks: number;
    themes: number;
  };
};

export function UserManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [blocked, setBlocked] = useState<boolean | undefined>(undefined);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Get users with pagination - only enabled when search or filters are applied
  const { data: userData, isLoading: isUsersLoading, refetch } = useQuery({
    ...trpc.admin.getUsers.queryOptions({
      page: currentPage,
      limit,
      role,
      blocked,
      search: searchQuery.length >= 2 ? searchQuery : undefined,
    }),
    enabled: hasSearched || searchQuery.length >= 2 || role !== undefined || blocked !== undefined
  });

  // Search users as you type
  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    ...trpc.admin.searchUsers.queryOptions({
      query: searchQuery.length >= 2 ? searchQuery : "",
    }),
    enabled: searchQuery.length >= 2,
    // Add retry: false to prevent unnecessary retries for invalid queries
    retry: false,
  });

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Always update the state to allow typing any characters
    setSearchQuery(value);
    
    // Auto-search when user types 2 or more characters
    if (value.length >= 2) {
      setHasSearched(true);
      refetch();
    } else if (value.length === 0 && hasSearched) {
      // Clear results if search is emptied
      refetch();
    }
  }, [hasSearched, refetch]);

  // Handle search form submission
  const handleSearchSubmit = useCallback((e: React.FormEvent<HTMLInputElement | HTMLFormElement>) => {
    e.preventDefault();
    
    // Only perform search if query is valid or empty
    try {
      if (searchQuery === "" || searchQuery.length >= 2) {
        setSearchError(null);
        setHasSearched(true);
        refetch();
      } else {
        // Provide feedback that search requires at least 2 characters
        setSearchError("Search query must be at least 2 characters");
      }
    } catch (error) {
      console.error("Search validation error:", error);
      setSearchError("Invalid search query");
    }
  }, [searchQuery, refetch]);

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setRole(undefined);
    setBlocked(undefined);
    setCurrentPage(1);
    setSearchError(null);
    setHasSearched(false);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Handle role filter change
  const handleRoleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setRole(value === "all" ? undefined : value);
    setCurrentPage(1);
    setHasSearched(true);
    refetch();
  }, [refetch]);

  // Handle blocked filter change
  const handleBlockedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setBlocked(
      value === "all" ? undefined : value === "blocked" ? true : false
    );
    setCurrentPage(1);
    setHasSearched(true);
    refetch();
  }, [refetch]);

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>

        {/* Search and Filters Row */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search Bar */}
          <div className="w-full md:w-1/2 relative">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    // Clear error when typing
                    if (searchError) setSearchError(null);
                    handleSearchChange(e);
                  }}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  placeholder="Search users by name or email"
                  className={`w-full px-4 py-2 rounded-lg border ${
                    searchError ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
                  } focus:outline-none focus:ring-2`}
                />
                <button 
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  <Search className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {searchError && (
                <p className="mt-1 text-sm text-red-600">{searchError}</p>
              )}
            </form>

            {/* Search results dropdown */}
            {isSearchFocused && searchQuery.length >= 2 && searchResults && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                {searchResults.map((user: User) => (
                  <div 
                    key={user.id} 
                    className="p-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setSearchQuery(user.name);
                      refetch();
                    }}
                  >
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-gray-600">{user.email}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-40">
              <select
                value={role || "all"}
                onChange={handleRoleChange}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="w-full sm:w-40">
              <select
                value={blocked === undefined ? "all" : blocked ? "blocked" : "active"}
                onChange={handleBlockedChange}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Users Table */}
        {!hasSearched && !searchQuery && role === undefined && blocked === undefined ? (
          <div className="py-16 text-center">
            <div className="text-gray-400 mb-4">
              <Search className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg">Enter a search query or apply filters to show users</p>
              <p className="text-sm">Start typing in the search box above to find users</p>
            </div>
          </div>
        ) : isUsersLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onelink</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Blocks</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Themes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userData?.users.map((user: User) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 flex-shrink-0">
                            {user.image ? (
                              <img
                                className="h-10 w-10 rounded-full"
                                src={user.image}
                                alt={user.name}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                                {user.name.substring(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {formatDate(user.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.onelink || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const roleFormat = formatUserRole(user.role);
                          return (
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${roleFormat.className}`}>
                              {roleFormat.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const statusFormat = formatUserStatus(user.block);
                          return (
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusFormat.className}`}>
                              {statusFormat.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user._count.blocks}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user._count.themes}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button 
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          onClick={() => {
                            // Fetch and display user details in a modal or navigate to user detail page
                            console.log(`View user ${user.id}`);
                            // In a real implementation, you might open a modal here or navigate to a user details page
                            // Example: navigate(`/admin/users/${user.id}`)
                            // Or trigger fetching details with the getUserDetails tRPC call
                          }}
                        >
                          View
                        </button>
                        <button 
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                          onClick={() => {
                            // Open user edit form in a modal or navigate to edit page
                            console.log(`Edit user ${user.id}`);
                          }}
                        >
                          Edit
                        </button>
                        <button 
                          className={`${user.block === 'yes' ? 'text-green-600 hover:text-green-900' : 'text-red-600 hover:text-red-900'}`}
                          onClick={() => {
                            // Toggle user block status
                            console.log(`Toggle block status for user ${user.id}`);
                            // In a real implementation, you'd call the updateUser mutation:
                            // trpcClient.admin.updateUser.mutate({
                            //   id: user.id,
                            //   block: user.block === 'yes' ? 'no' : 'yes'
                            // }).then(() => refetch());
                          }}
                        >
                          {user.block === 'yes' ? 'Unblock' : 'Block'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {userData?.users.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {userData?.pagination && userData.pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
                <div className="flex justify-between w-full">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing{" "}
                      <span className="font-medium">
                        {(currentPage - 1) * limit + 1}
                      </span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {Math.min(currentPage * limit, userData.pagination.total)}
                      </span>{" "}
                      of{" "}
                      <span className="font-medium">{userData.pagination.total}</span>{" "}
                      results
                    </p>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === 1
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">Previous</span>
                        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      </button>
                      
                      {/* Page numbers */}
                      {Array.from({ length: Math.min(5, userData.pagination.pages) }).map(
                        (_, i) => {
                          // Show pages around current page
                          const pageNumbersToShow = 5;
                          const halfPageNumbersToShow = Math.floor(pageNumbersToShow / 2);
                          
                          let startPage = Math.max(
                            1,
                            currentPage - halfPageNumbersToShow
                          );
                          
                          const endPage = Math.min(
                            startPage + pageNumbersToShow - 1,
                            userData.pagination.pages
                          );
                          
                          if (endPage - startPage < pageNumbersToShow - 1) {
                            startPage = Math.max(1, endPage - pageNumbersToShow + 1);
                          }
                          
                          const page = startPage + i;
                          
                          if (page > endPage) return null;
                          
                          return (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={`relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium ${
                                page === currentPage
                                  ? "text-blue-600 bg-blue-50"
                                  : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {page}
                            </button>
                          );
                        }
                      )}

                      <button
                        onClick={() => handlePageChange(Math.min(userData.pagination.pages, currentPage + 1))}
                        disabled={currentPage === userData.pagination.pages}
                        className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === userData.pagination.pages
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">Next</span>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
