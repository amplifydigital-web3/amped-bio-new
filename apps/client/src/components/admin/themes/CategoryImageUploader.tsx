import { useState, useRef, ChangeEvent } from "react";
import { Image as ImageIcon, Upload } from "lucide-react";
import { trpcClient } from "../../../utils/trpc";
import {
  ALLOWED_AVATAR_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
} from "@ampedbio/constants";
import { trpc } from "../../../utils/trpc/trpc";
import { useQuery } from "@tanstack/react-query";

interface CategoryImageUploaderProps {
  categoryId: number;
  currentImageUrl?: string;
  onImageUpload: (imageUrl: string, fileId: number) => void;
  onError?: (error: string) => void;
}

export function CategoryImageUploader({
  categoryId,
  currentImageUrl,
  onImageUpload,
  onError,
}: CategoryImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: uploadLimits } = useQuery(trpc.upload.getLimits.queryOptions());

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    if (file.size > (uploadLimits?.maxAvatarFileSize || 0)) {
      const errorMsg = `File size must be less than ${((uploadLimits?.maxAvatarFileSize || 0) / (1024 * 1024)).toFixed(2)}MB`;
      onError?.(errorMsg);
      return;
    }

    await handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);

    try {
      const fileType = file.type;
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

      console.log("Preparing to upload category image with:", {
        categoryId,
        contentType: fileType,
        fileExtension,
        fileName: file.name,
        fileSize: file.size,
      });

      // Request presigned URL from server for category image
      const presignedData =
        await trpcClient.admin.upload.requestThemeCategoryImagePresignedUrl.mutate({
          categoryId,
          contentType: fileType,
          fileExtension: fileExtension,
          fileSize: file.size,
        });

      console.log("Server response - presigned URL data for category image:", presignedData);

      // Upload to S3
      console.log(
        "Starting S3 upload for category image with presigned URL:",
        presignedData.presignedUrl.substring(0, 100) + "..."
      );
      const uploadResponse = await fetch(presignedData.presignedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": fileType,
        },
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("S3 category image upload failed:", {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          responseBody: errorText,
        });
        throw new Error(
          `Upload failed with status: ${uploadResponse.status} ${uploadResponse.statusText}`
        );
      }

      console.log("S3 category image upload completed successfully:", uploadResponse.status);

      // Confirm upload with the server
      const result = await trpcClient.admin.upload.confirmThemeCategoryImageUpload.mutate({
        categoryId,
        fileId: presignedData.fileId,
        fileName: file.name,
      });

      console.log("Server response - category image upload confirmation:", result);

      // Notify parent component
      onImageUpload(result.imageUrl, result.fileId);
    } catch (error: any) {
      console.error("Error uploading category image:", error);
      const errorMessage = error?.message || "Failed to upload category image";
      onError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Category Image</label>

      {/* Current Image Preview */}
      {currentImageUrl && (
        <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
          <img src={currentImageUrl} alt="Category" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Upload Button */}
      <div className="flex items-center gap-3">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={ALLOWED_AVATAR_FILE_TYPES.join(",")}
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Uploading...
            </>
          ) : (
            <>
              {currentImageUrl ? (
                <>
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Change Image
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Image
                </>
              )}
            </>
          )}
        </button>
      </div>

      {/* File Requirements */}
      <p className="text-xs text-gray-500">
        {ALLOWED_AVATAR_FILE_EXTENSIONS.join(", ").toUpperCase()}. Max{" "}
        {((uploadLimits?.maxAvatarFileSize || 0) / (1024 * 1024)).toFixed(2)}MB.
      </p>
    </div>
  );
}
