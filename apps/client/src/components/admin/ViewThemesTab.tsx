import { useState } from "react";
import { trpc, trpcClient } from "../../utils/trpc/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Eye, Edit, Trash2, Users, Calendar, Folder, Image, AlertTriangle, X } from "lucide-react";

interface ViewThemesTabProps {
  onSuccess: (message: string) => void;
  onError?: (message: string) => void;
}

interface DeleteModalState {
  isOpen: boolean;
  theme: any | null;
}

export function ViewThemesTab({ onSuccess, onError }: ViewThemesTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ isOpen: false, theme: null });
  const limit = 10;

  // Get theme categories for filtering
  const { data: categories } = useQuery(
    trpc.admin.getThemeCategories.queryOptions()
  );

  // Get themes with filtering and pagination
  const { data: themesData, isLoading, refetch } = useQuery(
    trpc.admin.getThemes.queryOptions({
      page: currentPage,
      limit,
      search: searchTerm || undefined,
      category_id: selectedCategory,
    })
  );

  // Delete theme mutation
  const deleteThemeMutation = useMutation({
    mutationFn: (themeId: number) => trpcClient.admin.deleteTheme.mutate({ id: themeId }),
    onSuccess: (data: any) => {
      onSuccess(data?.message || "Theme deleted successfully");
      refetch(); // Refresh the themes list
      setDeleteModal({ isOpen: false, theme: null });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to delete theme";
      if (onError) {
        onError(errorMessage);
      } else {
        onSuccess(`Error: ${errorMessage}`);
      }
      setDeleteModal({ isOpen: false, theme: null });
    },
  });

  const themes = themesData?.themes || [];
  const pagination = themesData?.pagination;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleCategoryFilter = (categoryId: number | undefined) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleDeleteClick = (theme: any) => {
    setDeleteModal({ isOpen: true, theme });
  };

  const handleDeleteConfirm = () => {
    if (deleteModal.theme) {
      deleteThemeMutation.mutate(deleteModal.theme.id);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, theme: null });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getShareLevelColor = (shareLevel: string) => {
    switch (shareLevel) {
      case 'public':
        return 'bg-green-100 text-green-800';
      case 'private':
        return 'bg-red-100 text-red-800';
      case 'shared':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Admin Themes
        </h2>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search admin themes..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory || ""}
            onChange={(e) => handleCategoryFilter(e.target.value ? Number(e.target.value) : undefined)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Categories</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.title}
              </option>
            ))}
          </select>
        </div>

        {/* Themes Grid */}
        {themes.length === 0 ? (
          <div className="text-center py-12">
            <Folder className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No admin themes found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || selectedCategory
                ? "Try adjusting your search or filters."
                : "No admin themes have been created yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {themes.map((theme: any) => (
              <div
                key={theme.id}
                className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200"
              >
                {/* Theme Preview */}
                <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 relative">
                  {theme.thumbnailImage?.url ? (
                    <img
                      src={theme.thumbnailImage.url}
                      alt={theme.name || "Theme preview"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Image className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Share Level Badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getShareLevelColor(theme.share_level)}`}>
                      {theme.share_level}
                    </span>
                  </div>
                </div>

                {/* Theme Info */}
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 mb-2">
                    {theme.name || "Untitled Theme"}
                  </h3>
                  
                  {theme.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {theme.description}
                    </p>
                  )}

                  {/* Meta Info */}
                  <div className="space-y-2 text-xs text-gray-500">
                    {theme.category && (
                      <div className="flex items-center gap-1">
                        <Folder className="h-3 w-3" />
                        <span>{theme.category.title}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>Admin Theme</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>Updated {formatDate(theme.updated_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end mt-4 gap-2">
                    <button
                      onClick={() => {
                        // TODO: Implement preview functionality
                        onSuccess("Preview functionality coming soon!");
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Preview theme"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Implement edit functionality
                        onSuccess("Edit functionality coming soon!");
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit theme"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(theme)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete theme"
                      disabled={deleteThemeMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-8">
            <div className="text-sm text-gray-500">
              Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, pagination.total)} of {pagination.total} admin themes
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              
              {/* Page Numbers */}
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  let pageNum;
                  if (pagination.pages <= 5) {
                    pageNum = i + 1;
                  } else {
                    const start = Math.max(1, currentPage - 2);
                    const end = Math.min(pagination.pages, start + 4);
                    pageNum = start + i;
                    if (pageNum > end) return null;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 text-sm border rounded ${
                        currentPage === pageNum
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === pagination.pages}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && deleteModal.theme && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Delete Theme
                </h3>
                <p className="text-sm text-gray-500">
                  This action cannot be undone.
                </p>
              </div>
              <button
                onClick={handleDeleteCancel}
                className="ml-auto flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-2">
                Are you sure you want to delete the theme <strong>"{deleteModal.theme.name || 'Untitled Theme'}"</strong>?
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                <p className="text-sm text-yellow-800">
                  <strong>Warning:</strong> This theme will only be deleted if no users are currently using it. 
                  If users are using this theme, the deletion will be prevented.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleDeleteCancel}
                disabled={deleteThemeMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteThemeMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 flex items-center gap-2"
              >
                {deleteThemeMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Theme
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
