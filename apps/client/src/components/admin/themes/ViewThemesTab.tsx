import { useState } from "react";
import { trpc, trpcClient } from "../../../utils/trpc";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search,
  Eye,
  Edit,
  Trash2,
  Users,
  Calendar,
  Folder,
  Image,
  AlertTriangle,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { EditThemeDialog, useEditThemeDialog } from "./EditThemeDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../../components/ui/dialog";

interface DeleteModalState {
  isOpen: boolean;
  theme: any | null;
  confirmationText: string;
}

interface DeleteModalState {
  isOpen: boolean;
  theme: any | null;
  confirmationText: string;
}

export function ViewThemesTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    theme: null,
    confirmationText: "",
  });
  const [previewLoading, setPreviewLoading] = useState<number | null>(null);
  const limit = 10;

  // Use the EditThemeDialog hook
  const editThemeDialog = useEditThemeDialog();

  // Get theme collections for filtering
  const { data: categories } = useQuery(trpc.admin.themes.getThemeCategories.queryOptions());

  // Get themes with filtering and pagination
  const {
    data: themesData,
    isLoading,
    refetch,
  } = useQuery(
    trpc.admin.themes.getThemes.queryOptions({
      page: currentPage,
      limit,
      search: searchTerm || undefined,
      category_id: selectedCategory,
    })
  );

  // Delete theme mutation
  const deleteThemeMutation = useMutation({
    mutationFn: (themeId: number) => trpcClient.admin.themes.deleteTheme.mutate({ id: themeId }),
    onSuccess: (data: any) => {
      const filesDeleted = data?.deletedFiles || 0;
      const message =
        filesDeleted > 0
          ? `${data?.message || "Theme deleted successfully"} (${filesDeleted} file${filesDeleted > 1 ? "s" : ""} also removed)`
          : data?.message || "Theme deleted successfully";
      toast.success(message);
      refetch(); // Refresh the themes list
      setDeleteModal({ isOpen: false, theme: null, confirmationText: "" });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to delete theme";
      toast.error(errorMessage);
      setDeleteModal({ isOpen: false, theme: null, confirmationText: "" });
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
    setDeleteModal({ isOpen: true, theme, confirmationText: "" });
  };

  const handleDeleteConfirm = () => {
    if (deleteModal.theme) {
      deleteThemeMutation.mutate(deleteModal.theme.id);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ isOpen: false, theme: null, confirmationText: "" });
  };

  const handleConfirmationTextChange = (value: string) => {
    setDeleteModal(prev => ({ ...prev, confirmationText: value }));
  };

  const isDeleteConfirmed = deleteModal.confirmationText.toLowerCase() === "delete";

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getShareLevelColor = (shareLevel: string) => {
    switch (shareLevel) {
      case "public":
        return "bg-green-100 text-green-800";
      case "private":
        return "bg-red-100 text-red-800";
      case "shared":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
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
              onChange={e => handleSearch(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Collection Filter */}
          <select
            value={selectedCategory || ""}
            onChange={e =>
              handleCategoryFilter(e.target.value ? Number(e.target.value) : undefined)
            }
            className="px-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">All Collections</option>
            {categories?.map(category => (
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
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getShareLevelColor(theme.share_level)}`}
                    >
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
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{theme.description}</p>
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
                        setPreviewLoading(theme.id);
                        setTimeout(() => {
                          setPreviewLoading(null);
                          toast.success("Preview functionality coming soon!");
                        }, 1000);
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Preview theme"
                      disabled={previewLoading === theme.id}
                    >
                      {previewLoading === theme.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        editThemeDialog.open({
                          id: theme.id,
                          name: theme.name,
                          description: theme.description,
                        })
                      }
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Edit theme"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(theme)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Delete theme"
                      disabled={deleteThemeMutation.isPending}
                    >
                      {deleteThemeMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
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
              Showing {(currentPage - 1) * limit + 1} to{" "}
              {Math.min(currentPage * limit, pagination.total)} of {pagination.total} admin themes
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1"
              >
                {isLoading && currentPage > 1 && <Loader2 className="h-3 w-3 animate-spin" />}
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
                      disabled={isLoading}
                      className={`px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                        currentPage === pageNum
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {isLoading && currentPage === pageNum && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === pagination.pages || isLoading}
                className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 flex items-center gap-1"
              >
                Next
                {isLoading && currentPage < pagination.pages && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModal.isOpen} onOpenChange={handleDeleteCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Theme
            </DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to delete the theme{" "}
              <strong>"{deleteModal.theme?.name || "Untitled Theme"}"</strong>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> This theme will only be deleted if no users are
                currently using it. If users are using this theme, the deletion will be prevented.
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">
                <strong>Files to be deleted:</strong> This action will permanently delete the
                theme's thumbnail and background images from the server. This cannot be undone.
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="confirmation-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                To confirm deletion, type <span className="font-bold text-red-600">"delete"</span>{" "}
                in the field below:
              </label>
              <input
                id="confirmation-input"
                type="text"
                value={deleteModal.confirmationText}
                onChange={e => handleConfirmationTextChange(e.target.value)}
                placeholder="Type 'delete' to confirm"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                disabled={deleteThemeMutation.isPending}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={handleDeleteCancel}
              disabled={deleteThemeMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleteThemeMutation.isPending || !isDeleteConfirmed}
              className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center gap-2 ${
                isDeleteConfirmed && !deleteThemeMutation.isPending
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
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
        </DialogContent>
      </Dialog>

      {/* Edit Theme Dialog */}
      <EditThemeDialog
        isOpen={editThemeDialog.isOpen}
        onClose={editThemeDialog.close}
        theme={editThemeDialog.theme || { id: 0, name: "" }}
        onSuccess={refetch}
      />
    </div>
  );
}
