import React, { useCallback, useMemo, memo, useState, useRef } from "react";
import { Check, Upload, Loader2 } from "lucide-react";
import type { Background } from "../../../types/editor";
import { gradients, photos, videos, backgroundColors } from "../../../utils/backgrounds";
import CollapsiblePanelWrapper from "../CollapsiblePanelWrapper";
import { trpcClient } from "../../../utils/trpc";
import { ALLOWED_BACKGROUND_FILE_EXTENSIONS, ALLOWED_BACKGROUND_FILE_TYPES, MAX_BACKGROUND_FILE_SIZE } from "@ampedbio/constants";

interface BackgroundPickerProps {
  value: Background;
  onChange: (background: Background) => void;
  themeId?: number;
}

// Helper function to extract media URL from server response
const extractMediaUrl = (result: any, fallback: string): string => {
  if (typeof result === 'object' && result !== null) {
    // Try different potential response structures
    if ('backgroundUrl' in result && typeof result.backgroundUrl === 'string') {
      return result.backgroundUrl;
    } else if ('backgroundVideoUrl' in result && typeof result.backgroundVideoUrl === 'string') {
      return result.backgroundVideoUrl;
    } else if ('backgroundImageUrl' in result && typeof result.backgroundImageUrl === 'string') {
      return result.backgroundImageUrl;
    } else if ('url' in result && typeof result.url === 'string') {
      return result.url;
    } else if ('theme' in result && 
              typeof result.theme === 'object' && 
              result.theme !== null && 
              'config' in result.theme) {
      const config = result.theme.config;
      if (typeof config === 'object' && 
          config !== null && 
          'background' in config && 
          typeof config.background === 'object' &&
          config.background !== null &&
          'value' in config.background) {
        return String(config.background.value);
      }
    }
  }
  // Fallback
  return fallback;
};

export const BackgroundPicker = memo(({ value, onChange, themeId }: BackgroundPickerProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset the file input to allow selecting the same file again
      e.target.value = '';
      
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
        setUploadError(`Unsupported file type. Allowed types: ${ALLOWED_BACKGROUND_FILE_TYPES.join(', ').toUpperCase()}`);
        return;
      }

      // Validate file extension
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_BACKGROUND_FILE_EXTENSIONS.includes(fileExtension)) {
        setUploadError(`Unsupported file extension. Allowed extensions: ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(', ')}`);
        return;
      }

      // Validate file size
      if (file.size > MAX_BACKGROUND_FILE_SIZE) {
        setUploadError(`File too large. Maximum size: ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB`);
        return;
      }

      try {
        setIsUploading(true);
        
        // Log upload attempt
        console.log(`Uploading ${isVideo ? 'video' : 'image'}: ${file.name} (${file.size} bytes, ${file.type}) for theme ID: ${themeId}`);
        
        // Request presigned URL from server
        const presignedData = await trpcClient.upload.requestThemeBackgroundUrl.mutate({
          contentType: file.type,
          fileExtension: fileExtension,
          fileSize: file.size,
        });
        
        console.log(`Received presigned URL from server for ${isVideo ? 'video' : 'image'}:`, presignedData);
        
        // Upload file to S3 using the presigned URL
        const uploadResponse = await fetch(presignedData.presignedUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error("S3 upload failed:", errorText);
          throw new Error(`Upload failed with status: ${uploadResponse.status}`);
        }
        
        console.log("File successfully uploaded to S3");
        
        // Confirm upload with the server
        const result = await trpcClient.upload.confirmThemeBackgroundUpload.mutate({
          fileKey: presignedData.fileKey,
          mediaType: isVideo ? 'video' : 'image'
        });
        
        console.log("Upload confirmed by server:", result);
        
        // Extract URL using helper function - this will extract the URL whether it's an image or video
        const fileUrl = extractMediaUrl(result, presignedData.fileKey);
        
        // Update the background with the new URL, setting the correct type based on the file type
        onChange({
          type: isImage ? "image" : "video",
          value: fileUrl,
          label: file.name,
        });
        
      } catch (e) {
        console.error("Error uploading background:", e);
        
        const errorMessage = e instanceof Error ? e.message : "Failed to upload file. Please try again.";
        
        if (errorMessage.includes("Theme not found") || errorMessage.includes("NOT_FOUND")) {
          setUploadError("Theme not found or no permission to modify it. Please refresh and try again.");
        } else if (errorMessage.includes("Network Error")) {
          setUploadError("Network error. Please check your connection and try again.");
        } else if (errorMessage.includes("413") || errorMessage.includes("Payload Too Large")) {
          setUploadError(`File exceeds server limit. Maximum size: ${MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB`);
        } else {
          setUploadError(errorMessage);
        }
      } finally {
        setIsUploading(false);
      }
    },
    [onChange, themeId]
  );



  const gradientsMemoized = useMemo(() => {
    return gradients.map(bg => (
      <button
        key={bg.value}
        onClick={() => onChange(bg)}
        className="relative aspect-video rounded-lg overflow-hidden group"
      >
        <img src={bg.value} alt={bg.label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium">{bg.label}</span>
        </div>
        {value.value === bg.value && (
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
        style={{ background: bg.value }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white text-sm font-medium drop-shadow-md">{bg.label}</span>
        </div>
        {value.value === bg.value && (
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
        {value.value === bg.value && (
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
        {value.value === bg.value && (
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

      {/* Custom File Upload */}
      {/* <CollapsiblePanelWrapper initialOpen={false} title="Custom Background">
        <label className="block">
          <div className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors">
            <Upload className="w-6 h-6 text-gray-400 mb-2" />
            <span className="text-sm text-gray-500">Upload image or video</span>
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={handleFileUpload}
          />
        </label>
      </CollapsiblePanelWrapper> */}

      {/* Custom Upload */}
      <CollapsiblePanelWrapper initialOpen={false} title="Upload Custom Background">
        <div className="block m-2">
          <div className="w-full flex flex-col gap-3">
            <div 
              className={`w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center ${
                isUploading ? 'border-blue-300 cursor-default' : 
                uploadError ? 'border-red-300 cursor-default' : 
                themeId === undefined ? 'border-gray-300 cursor-not-allowed opacity-70' : 
                'border-gray-300 hover:border-blue-500 cursor-pointer'
              } transition-colors`} 
              onClick={() => {
                if (!isUploading && themeId !== undefined) {
                  fileInputRef.current?.click();
                } else if (themeId === undefined) {
                  setUploadError("No theme selected. Cannot upload background.");
                }
              }}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  <span className="text-sm text-gray-600">Uploading file...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Upload image or video</span>
                  <p className="text-xs text-gray-400 mt-1">
                    Images: {['jpg', 'jpeg', 'png', 'svg'].join(', ').toUpperCase()} | Videos: {['mp4', 'mov', 'avi', 'webm'].join(', ').toUpperCase()} (Max {MAX_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB)
                  </p>
                </>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="video/mp4,video/quicktime,video/x-msvideo,video/webm,image/jpeg,image/jpg,image/png,image/svg+xml"
              onChange={handleFileUpload}
              disabled={isUploading || themeId === undefined}
            />
            
            {uploadError && (
              <p className="text-xs text-red-600 mt-1">
                {uploadError}
              </p>
            )}
          </div>
        </div>
      </CollapsiblePanelWrapper>
    </div>
  );
});
