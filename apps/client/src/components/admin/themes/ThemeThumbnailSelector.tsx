import { useState, useRef, ChangeEvent, useEffect } from "react";
import { Image as ImageIcon, Upload } from "lucide-react";
import {
  ALLOWED_AVATAR_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
} from "@ampedbio/constants";
import { trpc } from "../../../utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";

interface ThemeThumbnailSelectorProps {
  onFileSelect: (file: File | null) => void;
  onError?: (error: string) => void;
  selectedFile?: File | null;
  showRequiredError?: boolean;
}

export function ThemeThumbnailSelector({
  onFileSelect,
  onError,
  selectedFile,
  showRequiredError = false,
}: ThemeThumbnailSelectorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: uploadLimits } = useQuery(trpc.upload.getLimits.queryOptions());

  // Update preview URL when selectedFile changes
  useEffect(() => {
    // Clean up previous preview URL if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Create new preview URL if there's a selected file
    if (selectedFile) {
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(objectUrl);

      // Return cleanup function
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
  }, [selectedFile]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) {
      onFileSelect(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      return;
    }

    // Reset file input
    e.target.value = "";

    // Validate file type
    if (!ALLOWED_AVATAR_FILE_TYPES.includes(file.type)) {
      const errorMsg = `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()} images are allowed`;
      onError?.(errorMsg);
      return;
    }

    // Validate file extension
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_AVATAR_FILE_EXTENSIONS.includes(fileExtension)) {
      const errorMsg = `Only ${ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ")} file extensions are allowed`;
      onError?.(errorMsg);
      return;
    }

    // Validate file size (max 50MB for admin)
    const maxFileSize = uploadLimits?.maxAvatarFileSize || 50 * 1024 * 1024; // Fallback to 50MB if limits not loaded yet
    if (file.size > maxFileSize) {
      const errorMsg = `File size must be less than ${(maxFileSize / (1024 * 1024)).toFixed(2)}MB`;
      onError?.(errorMsg);
      return;
    }

    // Clean up previous preview URL if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Let the useEffect handle creating the new preview URL
    onFileSelect(file);
  };

  const clearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Theme Thumbnail <span className="text-red-500">*</span>
      </label>

      {/* Thumbnail selection display */}
      {selectedFile ? (
        <div className="flex items-center justify-between p-3 border border-gray-300 rounded-md bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {selectedFile.type} • {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Change
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Clear
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex items-center justify-center px-3 py-3 border-2 border-dashed rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            showRequiredError
              ? "border-red-300 text-red-600 hover:border-red-400 hover:text-red-700"
              : "border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-700"
          }`}
        >
          <Upload className="w-5 h-5 mr-2" />
          <span className="text-sm font-medium">Select Thumbnail</span>
        </button>
      )}

      {/* Error message for required field */}
      {showRequiredError && !selectedFile && (
        <p className="text-sm text-red-600 mt-1">Theme thumbnail is required</p>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={ALLOWED_AVATAR_FILE_TYPES.join(",")}
        onChange={handleFileSelect}
      />

      {/* File Requirements */}
      <p className="text-xs text-gray-500">
        {ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()}. Max{" "}
        {uploadLimits?.maxAvatarFileSize ? (uploadLimits.maxAvatarFileSize / (1024 * 1024)).toFixed(2) : '50'}MB.
      </p>
    </div>
  );
}
