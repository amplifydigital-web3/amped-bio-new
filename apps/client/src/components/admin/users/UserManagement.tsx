import { useState, useCallback, useEffect } from "react";
import { trpc, trpcClient } from "../../../utils/trpc";
import { Search, ChevronLeft, ChevronRight, X, Eye, EyeOff, ClipboardCopy, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { formatUserRole, formatUserStatus, formatDate } from "../../../utils/adminFormat";
import { maskEmail } from "../../../utils/email";

// Define schema for user edit form
const editUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
});

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
  wallet: {
    address: string;
  } | null;
};

type EditUserFormData = z.infer<typeof editUserSchema>;

export function UserManagement() {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [blocked, setBlocked] = useState<boolean | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showEmails, setShowEmails] = useState(false);
  const [copiedAddressId, setCopiedAddressId] = useState<number | null>(null);

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
    }),
    enabled: hasSearched || searchQuery.length >= 2 || role !== undefined || blocked !== undefined,
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
        setHasSearched(true);
        refetch();
      } else if (value.length === 0 && hasSearched) {
        // Clear results if search is emptied
        refetch();
      }
    },
    [hasSearched, refetch]
  );

  // Handle search form submission
  const handleSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLInputElement | HTMLFormElement>) => {
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
    setHasSearched(false);
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

  return (
    <div className="flex-1 p-6 bg-gray-50 overflow-auto">
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">User Management</h2>

        {/* Control Row - Search and Settings */}
        <div className="flex justify-between items-center mb-4">
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
                  className={`w-full px-4 py-2 rounded-lg border ${
                    searchError
                      ? "border-red-300 focus:ring-red-500"
                      : "border-gray-300 focus:ring-blue-500"
                  } focus:outline-none focus:ring-2`}
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Onelink
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Blocks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Themes
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date Joined
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
                            <div className="text-sm font-medium text-gray-900">{user.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {showEmails ? user.email : maskEmail(user.email)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.onelink || "-"}
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
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.wallet?.address || "-"}
                        {user.wallet?.address && (
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
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          className="text-blue-600 hover:text-blue-900 mr-3"
                          onClick={() => {
                            if (user.onelink) {
                              window.open(`/@${user.onelink}`, "_blank");
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
            {userData?.pagination && userData.pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
                <div className="flex justify-between w-full">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{(currentPage - 1) * limit + 1}</span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {Math.min(currentPage * limit, userData.pagination.total)}
                      </span>{" "}
                      of <span className="font-medium">{userData.pagination.total}</span> results
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
                        onClick={() =>
                          handlePageChange(Math.min(userData.pagination.pages, currentPage + 1))
                        }
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

      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Edit User</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setIsEditModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit}>
              <div className="mb-4">
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

              <div className="mb-4">
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

              <div className="mb-6">
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

              <div className="flex justify-end space-x-3">
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
          </div>
        </div>
      )}
    </div>
  );

  // Edit User Modal Component
  function EditUserModal({
    isOpen,
    onClose,
    user,
    errors,
    onChange,
    onSubmit,
  }: {
    isOpen: boolean;
    onClose: () => void;
    user: { id: number; name: string; email: string } | null;
    errors: { name?: string; email?: string };
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onSubmit: (e: React.FormEvent) => void;
  }) {
    if (!isOpen || !user) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">Edit User</h3>
            <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={onSubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={user.name}
                onChange={onChange}
                className={`w-full px-3 py-2 border rounded-md ${errors.name ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={user.email}
                onChange={onChange}
                className={`w-full px-3 py-2 border rounded-md ${errors.email ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
                onClick={onClose}
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
        </div>
      </div>
    );
  }
}
