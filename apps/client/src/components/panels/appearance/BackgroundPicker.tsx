import { useCallback, useMemo, memo, useState, useEffect } from "react";
import { Check, ExternalLink } from "lucide-react";
import type { Background } from "../../../types/editor";
import { gradients, photos, videos, backgroundColors } from "../../../utils/backgrounds";
import CollapsiblePanelWrapper from "../CollapsiblePanelWrapper";
import { trpc, trpcClient } from "../../../utils/trpc";
import { useEditor } from "../../../contexts/EditorContext";
import {
  ALLOWED_BACKGROUND_FILE_EXTENSIONS,
  ALLOWED_BACKGROUND_FILE_TYPES,
} from "@ampedbio/constants";
import { FileUpload } from "../../ui/FileUpload";
import { useQuery } from "@tanstack/react-query";

interface BackgroundPickerProps {
  value?: Background;
  onChange: (background: Background) => void;
  themeId?: number;
}

export const BackgroundPicker = memo(({ value, onChange, themeId }: BackgroundPickerProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [customURL, setCustomURL] = useState("");
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [previousLimits, setPreviousLimits] = useState<typeof uploadLimits>(undefined);

  // Get profile and setUser from store for refetching theme data after upload
  const { profile, setUser } = useEditor();
  const { data: uploadLimits, isLoading: isLoadingLimits } = useQuery(
    trpc.upload.getLimits.queryOptions()
  );

  // Track loading state changes and previous values
  useEffect(() => {
    if (!isLoadingLimits) {
      setIsFirstLoading(false);
      setPreviousLimits(uploadLimits);
    }
  }, [isLoadingLimits, uploadLimits]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      // Clear previous error
      setUploadError(null);

      // Validate theme ID
      if (themeId === undefined) {
        setUploadError("Cannot upload background: No theme is selected");
        return;
      }

      // Check file type (video or image)
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (!isVideo && !isImage) {
        setUploadError("Only video or image files can be uploaded as backgrounds");
        return;
      }

      // Validate file type (MIME type)
      if (!ALLOWED_BACKGROUND_FILE_TYPES.includes(file.type)) {
        setUploadError(
          `Unsupported file type. Allowed types: ${ALLOWED_BACKGROUND_FILE_TYPES.join(", ").toUpperCase()}`
        );
        return;
      }

      // Get file extension
      const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

      try {
        setIsUploading(true);

        // Log upload attempt
        console.log(
          `Uploading ${isVideo ? "video" : "image"}: ${file.name} (${file.size} bytes, ${file.type}) for theme ID: ${themeId}`
        );

        // Request presigned URL from server
        const presignedData = await trpcClient.upload.requestThemeBackgroundUrl.mutate({
          contentType: file.type,
          fileExtension: fileExtension,
          fileSize: file.size,
        });

        console.log(
          `Received presigned URL from server for ${isVideo ? "video" : "image"}:`,
          presignedData
        );

        // Upload file to S3 using the presigned URL
        const uploadResponse = await fetch(presignedData.presignedUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type,
          },
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          const errorDetails = {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            url: presignedData.presignedUrl.substring(0, 100) + "...", // Log partial URL for security
            responseBody: errorText,
            requestHeaders: { "Content-Type": file.type }, // Log request headers
          };
          console.error("S3 upload failed with HTTP error:", errorDetails);
          // Include more details from the server if available (e.g. XML error response from S3)
          throw new Error(
            `Upload failed with status: ${uploadResponse.status} ${uploadResponse.statusText}. Server response: ${errorText.substring(0, 200)}`
          );
        }

        console.log("File successfully uploaded to S3");

        // Confirm upload with the server
        const result = await trpcClient.upload.confirmThemeBackgroundUpload.mutate({
          fileId: presignedData.fileId,
          fileName: file.name,
          mediaType: presignedData.mediaType as "image" | "video", // Added type assertion
        });

        console.log("Server confirmed background upload:", result);

        // Instead of calling onChange/onUploadChange, refetch the theme data like the gallery does
        if (profile?.onelink) {
          console.log("Refetching theme data after background upload...");
          await setUser(profile.onelink);
          console.log("Theme data refetched successfully");
        } else {
          console.warn("No profile onelink available for theme refetch");
        }
      } catch (e) {
        console.error("Error uploading background:", e);

        const errorMessage =
          e instanceof Error ? e.message : "Failed to upload file. Please try again.";

        if (errorMessage.includes("Theme not found") || errorMessage.includes("NOT_FOUND")) {
          setUploadError(
            "Theme not found or no permission to modify it. Please refresh and try again."
          );
        } else if (errorMessage.includes("Network Error")) {
          setUploadError("Network error. Please check your connection and try again.");
        } else if (errorMessage.includes("413") || errorMessage.includes("Payload Too Large")) {
          // Use the same logic as in the UI to determine which limits to show
          const currentLimits = isLoadingLimits ? previousLimits : uploadLimits;
          setUploadError(
            currentLimits?.maxBackgroundFileSize
              ? `File exceeds server limit. Maximum size: ${currentLimits.maxBackgroundFileSize / (1024 * 1024)}MB`
              : `File exceeds server limit.`
          );
        } else {
          setUploadError(errorMessage);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [profile, setUser, themeId]
  );

  const handleURLUpload = useCallback(
    (type: "video" | "image") => {
      if (!customURL) return;
      onChange({
        type,
        value: customURL,
        label: "Custom Background",
      });
      setCustomURL(""); // Clear the input after setting
    },
    [customURL, onChange]
  );

  const gradientsMemoized = useMemo(() => {
    return gradients.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        <img src={bg.value || ""} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value?.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const backgroundColorsMemoized = useMemo(() => {
    return backgroundColors.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative h-24 rounded-lg overflow-hidden group"
        style={{ background: bg.value || "" }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium drop-shadow-md">{bg.label}</span>
        </div>
        {value?.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const photosMemoized = useMemo(() => {
    return photos.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        <img src={bg.thumbnail} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value?.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  const videosMemoized = useMemo(() => {
    return videos.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        {/* <video
          src={bg.value}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        /> */}
        <img src={bg.thumbnail} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value?.value === bg.value && (
          <div className="absolute inset-0 ring-2 ring-blue-500">
            <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </button>
    ));
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Gradients */}
      <CollapsiblePanelWrapper initialOpen={false} title="Gradient Backgrounds">
        <div className="grid grid-cols-2 gap-3">{gradientsMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Color Gradients */}
      <CollapsiblePanelWrapper initialOpen={false} title="Color Gradients">
        <div className="grid grid-cols-2 gap-3">{backgroundColorsMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Photos */}
      <CollapsiblePanelWrapper initialOpen={false} title="Photo Backgrounds">
        <div className="grid grid-cols-2 gap-3">{photosMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Videos */}
      <CollapsiblePanelWrapper initialOpen={false} title="Video Backgrounds">
        <div className="grid grid-cols-2 gap-3">{videosMemoized}</div>
      </CollapsiblePanelWrapper>

      {/* Custom Upload */}
      <CollapsiblePanelWrapper initialOpen={false} title="Upload Custom Background">
        <div className="block m-2">
          <div className="w-full flex flex-col gap-3">
            {/* Show indicator when current background has fileId */}
            {value?.fileId && (
              <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-800">
                  Current background is uploaded by you
                </span>
              </div>
            )}

            {/* Scenario 1: First loading - show skeleton */}
            {isLoadingLimits && isFirstLoading ? (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-12 bg-gray-200 animate-pulse rounded"></div>
                  <div className="h-4 w-32 bg-gray-200 animate-pulse rounded"></div>
                </div>
                <div className="h-16 w-full bg-gray-200 animate-pulse rounded"></div>
                <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded"></div>
              </div>
            ) : (
              <FileUpload
                acceptedExtensions={ALLOWED_BACKGROUND_FILE_EXTENSIONS}
                // Scenario 2/3/4: Use appropriate limits value based on loading state and previous value
                maxFileSize={
                  isLoadingLimits
                    ? previousLimits?.maxBackgroundFileSize
                    : uploadLimits?.maxBackgroundFileSize
                }
                onFileSelect={handleFileUpload}
                onError={setUploadError}
                disabled={themeId === undefined}
                isLoading={isUploading}
                title="Upload image or video"
                description={(() => {
                  // Base description without file size limit
                  const baseDescription = `Images: ${["jpg", "jpeg", "png", "svg"].join(", ").toUpperCase()} | Videos: ${["mp4", "mov", "avi", "webm"].join(", ").toUpperCase()}`;

                  // Determine which limits to use based on loading state
                  const currentLimits = isLoadingLimits ? previousLimits : uploadLimits;

                  // Add size limit if available
                  return currentLimits?.maxBackgroundFileSize
                    ? `${baseDescription} (Max ${currentLimits.maxBackgroundFileSize / (1024 * 1024)}MB)`
                    : baseDescription;
                })()}
              />
            )}

            <div className="mt-2">
              <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-xs text-yellow-800">
                  If you have already uploaded a background image or video, uploading a new file
                  will permanently replace your current background. This action cannot be undone.
                </span>
              </div>
            </div>

            {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}

            {/* Custom URL Section */}
            <div className="w-full border-t border-gray-200 pt-3 mt-3">
              <div className="w-full flex items-center gap-1 mb-2">
                <ExternalLink className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-500">Or set image or video URL</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter image or video URL"
                  value={customURL}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onChange={e => setCustomURL(e.target.value)}
                />
                <div className="w-full flex items-center gap-2">
                  <button
                    onClick={() => handleURLUpload("image")}
                    className="w-full px-1 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!customURL}
                  >
                    Set as Image
                  </button>
                  <button
                    onClick={() => handleURLUpload("video")}
                    className="w-full px-1 py-2 bg-gray-100 border border-gray-300 rounded-md shadow-sm hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!customURL}
                  >
                    Set as Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CollapsiblePanelWrapper>
    </div>
  );
});
