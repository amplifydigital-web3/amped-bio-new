import { useState, useRef, ChangeEvent } from "react";
import { trpc } from "../../../utils/trpc/trpc";
import {
  ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS,
  ALLOWED_AVATAR_FILE_TYPES,
} from "@ampedbio/constants";
import { PhotoEditor } from "./PhotoEditor";
import { useAuth } from "../../../contexts/AuthContext";

interface ImageUploaderProps {
  imageUrl: string;
  onImageChange: (url: string) => void;
}

export function ImageUploader({ imageUrl, onImageChange }: ImageUploaderProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { refreshUserData } = useAuth();
  const { data: uploadLimits } = trpc.upload.getLimits.useQuery();

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_AVATAR_FILE_TYPES.includes(file.type)) {
      setError(
        `Only ${ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.join(", ").toUpperCase()} images are allowed`
      );
      return;
    }

    // Validate file extension
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.includes(fileExtension)) {
      setError(
        `Only ${ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.join(", ")} file extensions are allowed`
      );
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > (uploadLimits?.maxAvatarFileSize || 0)) {
      setError(
        `File size must be less than ${((uploadLimits?.maxAvatarFileSize || 0) / (1024 * 1024)).toFixed(2)}MB`
      );
      return;
    }

    // Clear previous error
    setError(null);

    // Create a preview URL for the photo editor
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setShowPhotoEditor(true);
  };

  const handleEditCancel = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setShowPhotoEditor(false);
  };

  const handleEditComplete = async (editedImageDataUrl: string) => {
    setShowPhotoEditor(false);

    // Clean up the preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    // Convert data URL to File object
    const dataUrlParts = editedImageDataUrl.split(",");
    const byteString = atob(dataUrlParts[1]);
    const mimeType = dataUrlParts[0].split(":")[1].split(";")[0];

    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    // Create file name with correct extension based on mime type
    let fileExtension = "jpg";
    if (mimeType === "image/png") fileExtension = "png";
    if (mimeType === "image/gif") fileExtension = "gif";

    const editedFile = new File([ab], `profile-photo.${fileExtension}`, { type: mimeType });

    // Upload the edited file
    await handleUpload(editedFile);
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null); // Clear previous errors
    let presignedDataForLogging: { presignedUrl: string; fileId: number } | null = null;

    try {
      const fileType = file.type;
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "jpg";

      console.log("Preparing to upload profile image with:", {
        contentType: fileType,
        fileExtension,
        fileName: file.name,
        fileSize: file.size,
      });

      // Request presigned URL from server
      const presignedData = await trpcClient.upload.requestAvatarPresignedUrl.mutate({
        contentType: fileType,
        fileExtension: fileExtension,
        fileSize: file.size,
        category: "profiles",
      });
      presignedDataForLogging = presignedData;

      console.log("Server response - presigned URL data for profile image:", presignedData);

      try {
        console.log(
          "Starting S3 upload for profile image with presigned URL:",
          presignedData.presignedUrl.substring(0, 100) + "..."
        );
        const uploadResponse = await fetch(presignedData.presignedUrl, {
          method: "PUT",
          body: file, // Use the raw file object
          headers: {
            "Content-Type": fileType,
          },
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          const errorDetails = {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            url: presignedData.presignedUrl.substring(0, 100) + "...",
            responseBody: errorText,
          };
          console.error("S3 profile image upload failed with HTTP error:", errorDetails);
          throw new Error(
            `S3 Upload HTTP Error: ${uploadResponse.status} ${uploadResponse.statusText}. Response: ${errorText.substring(0, 200)}`
          );
        }

        console.log("S3 profile image upload completed successfully:", uploadResponse.status);

        // Confirm upload with the server
        const result = await trpcClient.upload.confirmProfilePictureUpload.mutate({
          fileId: presignedData.fileId,
          fileName: file.name,
          category: "profiles",
        });

        console.log("Server response - profile image upload confirmation:", result);

        // Update the profile with the new image URL
        onImageChange(result.profilePictureUrl);

        // Refresh user data to update the image in the header/sidebar
        await refreshUserData();
      } catch (uploadError: any) {
        let detailedMessage = "Failed to upload profile image to S3.";
        if (uploadError && uploadError.message?.startsWith("S3 Upload HTTP Error:")) {
          detailedMessage += ` Details: ${uploadError.message}`;
        } else {
          detailedMessage += ` Network error during upload: ${uploadError && uploadError.message ? uploadError.message : "Unknown fetch error"}. Check browser console for CORS or network issues. URL (partial): ${presignedDataForLogging?.presignedUrl.substring(0, 100)}...`;
        }
        console.error("S3 direct profile image upload error:", {
          message: uploadError && uploadError.message ? uploadError.message : "Unknown fetch error",
          stack: uploadError && uploadError.stack ? uploadError.stack : "No stack available",
          url: presignedDataForLogging?.presignedUrl.substring(0, 100) + "...",
          fileId: presignedDataForLogging?.fileId,
        });
        throw new Error(detailedMessage);
      }
    } catch (error: any) {
      let finalUserMessage = "Failed to upload profile image.";
      let logMessage = "Error in overall profile image upload process.";

      if (error && error.message?.startsWith("Failed to upload profile image to S3.")) {
        finalUserMessage = error.message;
        logMessage = `Upload to S3 failed for profile image: ${error.message}`;
      } else if (presignedDataForLogging === null && error && error.message) {
        finalUserMessage = `Failed to prepare profile image upload: ${error.message}`;
        logMessage = `Error requesting presigned URL for profile image: ${error.message}`;
      } else if (error && error.message) {
        finalUserMessage = `An unexpected error occurred during profile image upload: ${error.message}`;
        logMessage = `Unexpected error in profile image upload process: ${error.message}`;
      } else {
        finalUserMessage = "An unexpected error occurred during profile image upload.";
        logMessage = "Unexpected error in profile image upload process with no message.";
      }

      console.error(logMessage, {
        originalErrorMessage: error && error.message ? error.message : "No message available",
        originalErrorStack: error && error.stack ? error.stack : "No stack available",
        presignedUrlAttempted: presignedDataForLogging?.presignedUrl.substring(0, 100) + "...",
        fileIdAttempted: presignedDataForLogging?.fileId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      setError(finalUserMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-6">
        {/* Current Profile Image */}
        <div className="relative h-24 w-24 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
          {imageUrl ? (
            <img src={imageUrl} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-50">
              <svg className="h-12 w-12 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Upload Controls */}
        <div className="space-y-2">
          <div className="flex gap-2">
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "Uploading..." : "Change photo"}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS.join(", ").toUpperCase()}. Max{" "}
            {(uploadLimits?.maxAvatarFileSize || 0) / (1024 * 1024)}MB.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
      {showPhotoEditor && previewUrl && (
        <PhotoEditor
          imageUrl={previewUrl}
          onCancel={handleEditCancel}
          onComplete={handleEditComplete}
        />
      )}
    </div>
  );
}
