import { useState } from "react";
import { 
  File, 
  Image, 
  Video, 
  Download, 
  Eye, 
  Calendar, 
  User, 
  HardDrive,
  Search,
  Filter,
  ChevronDown,
  Loader2,
  AlertCircle,
  Trash2,
  X
} from "lucide-react";
import { FileData, FileStatus, FileType } from "../shared/fileTypes";
import { trpc } from "../../../utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

export function FileManagement() {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FileStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<FileType | "ALL">("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    file: FileData | null;
    confirmText: string;
  }>({
    isOpen: false,
    file: null,
    confirmText: "",
  });
  const pageSize = 10;

  // Fetch files from tRPC
  const { 
    data: filesData, 
    isLoading, 
    error,
    refetch 
  } = useQuery(
    trpc.admin.files.getFiles.queryOptions({
      page: currentPage,
      limit: pageSize,
      search: searchTerm || undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      fileType: typeFilter !== "ALL" ? typeFilter : undefined,
    })
  );

  // Delete file mutation
  const deleteFileMutation = useMutation({
    ...trpc.admin.files.deleteFile.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({
        queryKey: trpc.admin.files.getFiles.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to delete file: ${error.message}`);
    },
  });

  const files = filesData?.files || [];
  const pagination = filesData?.pagination;

  // Helper functions
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileTypeIcon = (fileType: string | null) => {
    if (!fileType) return <File className="h-4 w-4" />;
    
    if (fileType.startsWith("image/")) return <Image className="h-4 w-4 text-green-500" />;
    if (fileType.startsWith("video/")) return <Video className="h-4 w-4 text-blue-500" />;
    return <File className="h-4 w-4 text-gray-500" />;
  };

  const getFilePreview = (file: FileData) => {
    // Show preview image for images and videos
    if (file.preview_url && (file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/"))) {
      return (
        <div className="relative group">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
            <img
              src={file.preview_url}
              alt={file.file_name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback to icon if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.innerHTML = `
                  <div class="w-full h-full flex items-center justify-center">
                    ${file.file_type?.startsWith("image/") ? 
                      '<svg class="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>' :
                      '<svg class="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>'
                    }
                  </div>
                `;
              }}
            />
          </div>
          
          {/* Hover preview */}
          <div className="absolute left-12 top-0 invisible group-hover:visible z-50 transition-all duration-200">
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2">
              <img
                src={file.preview_url}
                alt={file.file_name}
                className="w-32 h-32 object-cover rounded"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.parentElement!.innerHTML = `
                    <div class="w-32 h-32 flex items-center justify-center bg-gray-100 rounded">
                      <span class="text-gray-500 text-sm">Preview not available</span>
                    </div>
                  `;
                }}
              />
            </div>
          </div>
        </div>
      );
    }
    
    // Fallback to icon for non-previewable files
    return (
      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        {getFileTypeIcon(file.file_type)}
      </div>
    );
  };

  const getStatusColor = (status: FileStatus) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "DELETED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getFileTypeFromMime = (mimeType: string | null): FileType => {
    if (!mimeType) return "other";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.includes("pdf") || mimeType.includes("document")) return "document";
    return "other";
  };

  // Filter files based on search and filters - now handled by server
  const handleSearch = () => {
    setCurrentPage(1); // Reset to first page when searching
    refetch();
  };

  const handleFilterChange = () => {
    setCurrentPage(1); // Reset to first page when filtering
    refetch();
  };

  const handlePreviewFile = async (file: FileData) => {
    try {
      const previewData = await queryClient.fetchQuery(
        trpc.admin.files.getFilePreviewUrl.queryOptions({ fileId: file.id })
      );
      // Open preview in a new window/tab
      window.open(previewData.previewUrl, '_blank');
    } catch (error: any) {
      toast.error(`Failed to generate preview: ${error.message}`);
    }
  };

  const handleDownloadFile = async (file: FileData) => {
    try {
      const downloadData = await queryClient.fetchQuery(
        trpc.admin.files.getFileDownloadUrl.queryOptions({ fileId: file.id })
      );
      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadData.downloadUrl;
      link.download = downloadData.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      toast.error(`Failed to download file: ${error.message}`);
    }
  };

  const handleDeleteFile = (file: FileData) => {
    setDeleteConfirmation({
      isOpen: true,
      file,
      confirmText: "",
    });
  };

  const confirmDeleteFile = () => {
    if (deleteConfirmation.file && deleteConfirmation.confirmText.toLowerCase() === "delete") {
      deleteFileMutation.mutate({ fileId: deleteConfirmation.file.id });
      setDeleteConfirmation({
        isOpen: false,
        file: null,
        confirmText: "",
      });
    }
  };

  const cancelDeleteFile = () => {
    setDeleteConfirmation({
      isOpen: false,
      file: null,
      confirmText: "",
    });
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading files...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <AlertCircle className="h-8 w-8 text-red-600" />
          <div className="ml-2">
            <h3 className="text-lg font-medium text-red-600">Error loading files</h3>
            <p className="text-red-500">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Delete File</h3>
                  <p className="text-sm text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={cancelDeleteFile}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                You are about to delete:{" "}
                <span className="font-medium text-gray-900">
                  {deleteConfirmation.file?.file_name}
                </span>
              </p>
              <div className="bg-gray-50 rounded-md p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">File Key:</p>
                <p className="text-sm font-mono text-gray-700 break-all">
                  {deleteConfirmation.file?.s3_key}
                </p>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                To confirm, please type <span className="font-mono bg-gray-100 px-1 rounded">delete</span> below:
              </p>
              <input
                type="text"
                value={deleteConfirmation.confirmText}
                onChange={(e) =>
                  setDeleteConfirmation((prev) => ({
                    ...prev,
                    confirmText: e.target.value,
                  }))
                }
                placeholder="Type 'delete' to confirm"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                autoFocus
              />
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={cancelDeleteFile}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                disabled={
                  deleteConfirmation.confirmText.toLowerCase() !== "delete" ||
                  deleteFileMutation.isPending
                }
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteFileMutation.isPending ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Deleting...
                  </div>
                ) : (
                  "Delete File"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">File Management</h2>
          <p className="text-gray-600 mt-1">
            Total: {pagination?.total || 0} files
          </p>
        </div>
        
        {/* Storage Summary */}
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <div className="flex items-center space-x-2">
            <HardDrive className="h-4 w-4" />
            <span>
              {formatFileSize(files.reduce((acc, file) => acc + file.size, 0))} total storage
            </span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4 mb-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search files by name, path, or user..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Filter className="h-4 w-4" />
          <span>Filters</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as FileStatus | "ALL");
                  handleFilterChange();
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="DELETED">Deleted</option>
              </select>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">File Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as FileType | "ALL");
                  handleFilterChange();
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ALL">All Types</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
                <option value="document">Documents</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Files Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  File
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type & Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uploaded
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      {getFilePreview(file)}
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {file.file_name}
                        </p>
                        <p className="text-sm text-gray-500 truncate max-w-xs">
                          {file.s3_key}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="text-sm text-gray-900">
                        {file.file_type || "Unknown"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">
                        {file.userName}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(file.status)}`}>
                      {file.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(file.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {(file.file_type?.startsWith("image/") || file.file_type?.startsWith("video/")) && (
                        <button
                          onClick={() => handlePreviewFile(file)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Preview file"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                        title="Download file"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file)}
                        disabled={deleteFileMutation.isPending}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Delete file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {files.length === 0 && (
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <File className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No files found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || statusFilter !== "ALL" || typeFilter !== "ALL"
                ? "Try adjusting your search or filters."
                : "No files have been uploaded yet."}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">{((currentPage - 1) * pageSize) + 1}</span> to{" "}
            <span className="font-medium">{Math.min(currentPage * pageSize, pagination.total)}</span> of{" "}
            <span className="font-medium">{pagination.total}</span> results
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {pagination.pages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= pagination.pages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
