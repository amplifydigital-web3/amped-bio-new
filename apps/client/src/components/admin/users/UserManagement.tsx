import { useState, useCallback } from "react";
import { trpc, trpcClient } from "../../../utils/trpc";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  Eye,
  EyeOff,
  ClipboardCopy,
  Check,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { formatUserRole, formatUserStatus, formatDate } from "../../../utils/adminFormat";
import { maskEmail } from "../../../utils/email";
import { Tooltip } from "@/components/ui/Tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";

// Define schema for user edit form
const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
});

const truncateAddress = (addr: string) => {
  if (!addr || addr.length <= 10) return addr;
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
};

export function UserManagement() {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [blocked, setBlocked] = useState<boolean | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showEmails, setShowEmails] = useState(false);
  const [copiedAddressId, setCopiedAddressId] = useState<number | null>(null);
  const [sortDescriptor, setSortDescriptor] = useState<{
    column: string;
    direction: "asc" | "desc";
  }>({ column: "created_at", direction: "desc" });

  // Edit User Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);
  const [editFormErrors, setEditFormErrors] = useState<{
    name?: string;
    email?: string;
    confirmation?: string;
  }>({});
  const [confirmationText, setConfirmationText] = useState("");

  // Handle confirmation text change
  const handleConfirmationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationText(e.target.value);

    // Clear error if user is typing
    if (editFormErrors.confirmation) {
      setEditFormErrors({
        ...editFormErrors,
        confirmation: undefined,
      });
    }
  };

  // Handle open edit modal with reset state
  const handleOpenEditModal = (user: { id: number; name: string; email: string }) => {
    setEditingUser(user);
    setEditFormErrors({});
    setConfirmationText("");
    setIsEditModalOpen(true);
  };

  // Get users with pagination - only enabled when search or filters are applied
  const {
    data: userData,
    isLoading: isUsersLoading,
    refetch,
  } = useQuery({
    ...trpc.admin.users.getUsers.queryOptions({
      page: currentPage,
      limit,
      role,
      blocked,
      search: searchQuery.length >= 2 ? searchQuery : undefined,
      sortBy: sortDescriptor.column,
      sortDirection: sortDescriptor.direction,
    }),
  });

  // Handle edit form submission
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingUser) return;

    // Check confirmation text
    if (confirmationText !== "UPDATE") {
      setEditFormErrors({
        ...editFormErrors,
        confirmation: "You must type UPDATE to confirm changes",
      });
      return;
    }

    try {
      // Validate form inputs
      const validatedData = editUserSchema.parse(editingUser);

      // Call the tRPC mutation to update the user
      trpcClient.admin.users.updateUser
        .mutate({
          id: editingUser.id,
          name: validatedData.name,
          email: validatedData.email,
        })
        .then(() => {
          // Close modal and refresh data
          setIsEditModalOpen(false);
          setEditingUser(null);
          setConfirmationText("");
          refetch();
        })
        .catch(error => {
          console.error("Failed to update user:", error);
          setEditFormErrors({
            email: error.message.includes("email") ? error.message : undefined,
          });
        });
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Format Zod errors into our error state shape
        const formattedErrors = error.errors.reduce(
          (acc, curr) => {
            const path = curr.path[0] as string;
            acc[path as keyof typeof acc] = curr.message;
            return acc;
          },
          {} as { name?: string; email?: string; confirmation?: string }
        );

        setEditFormErrors(formattedErrors);
      }
    }
  };

  // Handle input changes in edit form
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (editingUser) {
      setEditingUser({
        ...editingUser,
        [name]: value,
      });

      // Clear the specific field error when user types
      if (editFormErrors[name as keyof typeof editFormErrors]) {
        setEditFormErrors({
          ...editFormErrors,
          [name]: undefined,
        });
      }
    }
  };

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Always update the state to allow typing any characters
      setSearchQuery(value);

      // Auto-search when user types 2 or more characters
      if (value.length >= 2) {
        refetch();
      } else if (value.length === 0) {
        // Clear results if search is emptied
        refetch();
      }
    },
    [refetch]
  );

  // Handle search form submission
  const handleSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLInputElement | HTMLFormElement>) => {
      e.preventDefault();

      // Only perform search if query is valid or empty
      try {
        if (searchQuery === "" || searchQuery.length >= 2) {
          setSearchError(null);
          refetch();
        } else {
          // Provide feedback that search requires at least 2 characters
          setSearchError("Search query must be at least 2 characters");
        }
      } catch (error) {
        console.error("Search validation error:", error);
        setSearchError("Invalid search query");
      }
    },
    [searchQuery, refetch]
  );

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setRole(undefined);
    setBlocked(undefined);
    setCurrentPage(1);
    setSearchError(null);
  }, []);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Handle role filter change
  const handleRoleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setRole(value === "all" ? undefined : value);
      setCurrentPage(1);
      setHasSearched(true);
      refetch();
    },
    [refetch]
  );

  // Handle blocked filter change
  const handleBlockedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setBlocked(value === "all" ? undefined : value === "blocked" ? true : false);
      setCurrentPage(1);
      setHasSearched(true);
      refetch();
    },
    [refetch]
  );

  // Toggle email visibility
  const toggleEmailVisibility = useCallback(() => {
    setShowEmails(prev => !prev);
  }, []);

  const handleSort = (column: string) => {
    setSortDescriptor(prev => {
      if (prev.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      } else {
        return { column, direction: "desc" };
      }
    });
    refetch();
  };

  const renderSortArrow = (column: string) => {
    if (sortDescriptor.column !== column) return null;
    if (sortDescriptor.direction === "asc") {
      return <ChevronUp className="h-4 w-4 ml-1" />;
    } else {
      return <ChevronDown className="h-4 w-4 ml-1" />;
    }
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLimit(Number(e.target.value));
    setCurrentPage(1);
    refetch();
  };

  const handleExportCSV = () => {
    if (!userData) return;

    const escapeCSV = (str: string | number | null) => {
      if (str === null || str === undefined) {
        return "";
      }
      const string = String(str);
      if (string.includes('"')) {
        return `"${string.replace(/"/g, '""')}"`;
      }
      if (string.includes(",")) {
        return `"${string}"`;
      }
      return string;
    };

    const headers = [
      "ID",
      "Name",
      "Email",
      "Onelink",
      "Role",
      "Status",
      "Blocks",
      "Themes",
      "Date Joined",
      "Wallet Address",
    ];

    const rows = userData.users.map(user =>
      [
        user.id,
        escapeCSV(user.name),
        escapeCSV(user.email),
        escapeCSV(user.handle),
        escapeCSV(user.role),
        escapeCSV(user.block === "yes" ? "Blocked" : "Active"),
        user._count.blocks,
        user._count.themes,
        escapeCSV(formatDate(user.created_at)),
        escapeCSV(user.wallet?.address ?? null),
      ].join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "users.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>

        {/* Control Row - Search and Settings */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            {/* Email Visibility Toggle */}
            <button
              onClick={toggleEmailVisibility}
              className="flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
            >
              {showEmails ? (
                <>
                  <EyeOff className="h-4 w-4 mr-1.5" />
                  <span>Hide Emails</span>
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1.5" />
                  <span>Show Emails</span>
                </>
              )}
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!userData || userData.users.length === 0}
              className="flex items-center px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4 mr-1.5" />
              <span>Export as CSV</span>
            </button>
          </div>
        </div>

        {/* Search and Filters Row */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Search Bar */}
          <div className="w-full md:w-1/2 relative">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    // Clear error when typing
                    if (searchError) setSearchError(null);
                    handleSearchChange(e);
                  }}
                  placeholder="Search users by name, email, or wallet address"
                  className={`w-full px-4 py-2 rounded-lg border ${searchError ? "border-red-300 focus:ring-red-500" : "border-gray-300 focus:ring-blue-500"} focus:outline-none focus:ring-2`}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2"
                >
                  <Search className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {searchError && <p className="mt-1 text-sm text-red-600">{searchError}</p>}
            </form>
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
        {isUsersLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("name")}
                    >
                      <div className="flex items-center">
                        Name
                        {renderSortArrow("name")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("email")}
                    >
                      <div className="flex items-center">
                        Email
                        {renderSortArrow("email")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("handle")}
                    >
                      <div className="flex items-center">
                        Handle
                        {renderSortArrow("handle")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("role")}
                    >
                      <div className="flex items-center">
                        Role
                        {renderSortArrow("role")}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("blocks")}
                    >
                      <div className="flex items-center">
                        Blocks
                        {renderSortArrow("blocks")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("themes")}
                    >
                      <div className="flex items-center">
                        Themes
                        {renderSortArrow("themes")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("totalClicks")}
                    >
                      <div className="flex items-center">
                        Total Clicks
                        {renderSortArrow("totalClicks")}
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => handleSort("created_at")}
                    >
                      <div className="flex items-center">
                        Date Joined
                        {renderSortArrow("created_at")}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Wallet Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userData?.users.map(user => (
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
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {showEmails ? user.email : maskEmail(user.email)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.handle || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const roleFormat = formatUserRole(user.role);
                          return (
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${roleFormat.className}`}
                            >
                              {roleFormat.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const statusFormat = formatUserStatus(user.block);
                          return (
                            <span
                              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusFormat.className}`}
                            >
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.totalClicks}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.wallet?.address ? (
                          <div className="flex items-center">
                            <Tooltip content={user.wallet.address}>
                              <span className="cursor-pointer">
                                {truncateAddress(user.wallet.address)}
                              </span>
                            </Tooltip>
                            <button
                              className="ml-2 text-gray-400 hover:text-gray-600"
                              onClick={() => {
                                navigator.clipboard.writeText(user.wallet?.address || "");
                                setCopiedAddressId(user.id);
                                setTimeout(() => setCopiedAddressId(null), 1000);
                              }}
                            >
                              {copiedAddressId === user.id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <ClipboardCopy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          onClick={() => {
                            if (user.handle) {
                              window.open(`/@${user.handle}`, "_blank");
                            }
                          }}
                        >
                          View
                        </button>
                        <button
                          className="text-indigo-600 hover:text-indigo-900 mr-3"
                          onClick={() => handleOpenEditModal(user)}
                        >
                          Edit
                        </button>
                        <button
                          className={`${user.block === "yes" ? "text-green-600 hover:text-green-900" : "text-red-600 hover:text-red-900"}`}
                          onClick={() => {
                            // Toggle user block status
                            trpcClient.admin.users.updateUser
                              .mutate({
                                id: user.id,
                                block: user.block === "yes" ? "no" : "yes",
                              })
                              .then(() => refetch());
                          }}
                        >
                          {user.block === "yes" ? "Unblock" : "Block"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {userData?.users.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-10 text-center text-gray-500">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {userData?.pagination && (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      handlePageChange(Math.min(userData.pagination.pages, currentPage + 1))
                    }
                    disabled={currentPage === userData.pagination.pages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div className="flex items-center gap-x-2">
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{(currentPage - 1) * limit + 1}</span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {Math.min(currentPage * limit, userData.pagination.total)}
                      </span>{" "}
                      of <span className="font-medium">{userData.pagination.total}</span> results
                    </p>
                    <div className="w-full sm:w-28">
                      <select
                        value={limit}
                        onChange={handleLimitChange}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="10">10 / page</option>
                        <option value="20">20 / page</option>
                        <option value="50">50 / page</option>
                        <option value="100">100 / page</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${currentPage === 1 ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-50"}`}
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

                          let startPage = Math.max(1, currentPage - halfPageNumbersToShow);

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
                              className={`relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium ${page === currentPage ? "text-blue-600 bg-blue-50" : "text-gray-700 hover:bg-gray-50"}`}
                            >
                              {page}
                            </button>
                          );
                        }
                      )}

                      <button
                        onClick={() =>
                          handlePageChange(Math.min(userData.pagination.pages, currentPage + 1))
                        }
                        disabled={currentPage === userData.pagination.pages}
                        className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${currentPage === userData.pagination.pages ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-50"}`}
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

      {/* Edit User Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 mb-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={editingUser?.name || ""}
                  onChange={handleEditInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${editFormErrors.name ? "border-red-500" : "border-gray-300"}`}
                />
                {editFormErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{editFormErrors.name}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={editingUser?.email || ""}
                  onChange={handleEditInputChange}
                  className={`w-full px-3 py-2 border rounded-md ${editFormErrors.email ? "border-red-500" : "border-gray-300"}`}
                />
                {editFormErrors.email && (
                  <p className="mt-1 text-sm text-red-600">{editFormErrors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="confirmation"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Type "UPDATE" to confirm changes
                </label>
                <input
                  type="text"
                  id="confirmation"
                  name="confirmation"
                  value={confirmationText}
                  onChange={handleConfirmationChange}
                  placeholder="UPDATE"
                  className={`w-full px-3 py-2 border rounded-md ${editFormErrors.confirmation ? "border-red-500" : "border-gray-300"}`}
                />
                {editFormErrors.confirmation && (
                  <p className="mt-1 text-sm text-red-600">{editFormErrors.confirmation}</p>
                )}

                <div className="mt-3 text-sm bg-yellow-50 border border-yellow-100 p-2 rounded">
                  <p className="font-medium text-yellow-800">You are about to edit:</p>
                  <ul className="list-disc list-inside text-yellow-700 mt-1">
                    <li>
                      Name: <span className="font-medium">{editingUser?.name}</span>
                    </li>
                    <li>
                      Email: <span className="font-medium">{editingUser?.email}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Save Changes
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
