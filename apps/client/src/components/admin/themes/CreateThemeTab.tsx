import { useState, useCallback, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc, trpcClient } from "../../../utils/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Upload,
  AlertCircle,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { ThemeThumbnailSelector } from "./ThemeThumbnailSelector";
import { importThemeConfigFromJson } from "../../../utils/theme";
import { generateVideoThumbnailFromUrl, downloadMediaFromUrl } from "../../../utils/videoThumbnail";
import { toast } from "react-hot-toast";
import {
  ALLOWED_BACKGROUND_FILE_TYPES,
  ALLOWED_BACKGROUND_FILE_EXTENSIONS,
  MAX_ADMIN_BACKGROUND_FILE_SIZE,
} from "@ampedbio/constants";

// Utility function to get file extension from content type
const getExtensionFromContentType = (contentType: string): string | null => {
  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-msvideo": "avi",
    "video/webm": "webm",
  };

  return typeMap[contentType] || null;
};

// Utility function to validate file for background upload
const validateBackgroundFile = (file: File): { isValid: boolean; error?: string } => {
  // Check file type
  if (!ALLOWED_BACKGROUND_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: `File type ${file.type} is not supported. Allowed types: ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(", ").toUpperCase()}`,
    };
  }

  // Check file size
  if (file.size > MAX_ADMIN_BACKGROUND_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed size of ${MAX_ADMIN_BACKGROUND_FILE_SIZE / (1024 * 1024)}MB`,
    };
  }

  // Check file extension
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_BACKGROUND_FILE_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: `File extension must be one of: ${ALLOWED_BACKGROUND_FILE_EXTENSIONS.join(", ")}`,
    };
  }

  return { isValid: true };
};

// Utility function to reduce image quality to 75%
const reduceImageQuality = (file: File, quality: number = 0.75): Promise<File> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    // Create object URL for the image
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // Clean up the object URL immediately after loading
      URL.revokeObjectURL(objectUrl);

      // Set canvas dimensions to match the image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the image on canvas
      ctx?.drawImage(img, 0, 0);

      // Convert to blob with reduced quality
      canvas.toBlob(
        blob => {
          if (blob) {
            // Create a new file with the same name but reduced quality
            const reducedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(reducedFile);
          } else {
            reject(new Error("Failed to reduce image quality"));
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => {
      // Clean up the object URL on error
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };

    // Set the source to the object URL
    img.src = objectUrl;
  });
};

// Utility function to create thumbnail from theme background image URL
const createThumbnailFromImageUrl = async (imageUrl: string): Promise<File | null> => {
  try {
    // Fetch the image from the URL
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Failed to fetch image");

    const blob = await response.blob();
    const file = new File([blob], "theme-background.jpg", { type: blob.type });

    // Reduce quality to 75%
    const thumbnailFile = await reduceImageQuality(file, 0.75);
    return thumbnailFile;
  } catch (error) {
    console.error("Error creating thumbnail from image URL:", error);
    return null;
  }
};

// Utility function to create thumbnail from video URL
const createThumbnailFromVideoUrl = async (videoUrl: string): Promise<File | null> => {
  try {
    const result = await generateVideoThumbnailFromUrl(videoUrl, {
      width: 400,
      height: 300,
      quality: 0.75,
      timeStamp: 1,
      format: "image/jpeg",
    });

    return result?.file || null;
  } catch (error) {
    console.warn("Error creating thumbnail from video URL:", error);
    return null;
  }
};

const themeSchema = z.object({
  name: z
    .string()
    .min(1, "Theme name is required")
    .max(100, "Theme name must be less than 100 characters"),
  description: z.string().max(500, "Description must be less than 500 characters").optional(),
  share_config: z.any().optional(),
  config: z.any().optional(),
  category_id: z.number().min(1, "Collection is required"),
});

type ThemeForm = z.infer<typeof themeSchema>;

export function CreateThemeTab() {
  const [selectedThumbnailFile, setSelectedThumbnailFile] = useState<File | null>(null);
  const [showThumbnailRequiredError, setShowThumbnailRequiredError] = useState(false);
  const [downloadedBackgroundFile, setDownloadedBackgroundFile] = useState<File | null>(null);
  const [backgroundSource, setBackgroundSource] = useState<"imported" | "manual" | null>(null);
  const [isDownloadingBackground, setIsDownloadingBackground] = useState(false);

  // Import theme file state
  const [importedThemeConfig, setImportedThemeConfig] = useState<any>(null);
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);

  // React Hook Form for theme creation
  const themeForm = useForm<ThemeForm>({
    resolver: zodResolver(themeSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      description: "",
      share_config: {},
      config: {},
    },
  });

  // Clear error messages when user starts typing
  const clearErrorMessages = useCallback(() => {
    // Toast notifications are handled automatically
  }, []);

  // Create handlers that combine form registration with error clearing
  const createInputHandler = useCallback(
    (registerFn: any) => {
      return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        registerFn.onChange(e);
        clearErrorMessages();
      };
    },
    [clearErrorMessages]
  );

  // Special handler for category_id select with value transformation
  const handleCategorySelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const stringValue = e.target.value;
      if (stringValue === "") {
        // Don't set anything when empty - this will trigger validation error
        themeForm.setValue("category_id", undefined as any);
      } else {
        // Convert to number when a valid category is selected
        const numericValue = Number(stringValue);
        themeForm.setValue("category_id", numericValue);
      }
      clearErrorMessages();
    },
    [themeForm, clearErrorMessages]
  );

  // Queries and mutations
  const { data: categories } = useQuery(trpc.admin.themes.getThemeCategories.queryOptions());

  const themeMutation = useMutation(trpc.admin.themes.createTheme.mutationOptions());

  const handleThemeSubmit = async (data: ThemeForm) => {
    // Validate that a thumbnail is selected
    if (!selectedThumbnailFile) {
      setShowThumbnailRequiredError(true);
      toast.error("Theme thumbnail is required");
      return;
    }

    try {
      // Step 1: Create the theme
      const newTheme = await themeMutation.mutateAsync(data);

      let backgroundUploadSuccess = false;
      let thumbnailUploadSuccess = false;

      // Step 2: If there's a background file from imported theme, upload it
      if (downloadedBackgroundFile) {
        try {
          const backgroundFileId = await uploadThemeBackground(
            newTheme.id,
            downloadedBackgroundFile
          );
          backgroundUploadSuccess = true;

          // Note: The background upload already updates the theme config with the new file reference
          // so we don't need to manually update the theme config here
        } catch (backgroundError: any) {
          console.error("Background upload failed:", backgroundError);
          toast.error(`Background upload failed: ${backgroundError.message}`);
        }
      }

      // Step 3: Upload the thumbnail file (required)
      try {
        await uploadThemeThumbnail(newTheme.id, selectedThumbnailFile);
        thumbnailUploadSuccess = true;
      } catch (thumbnailError: any) {
        console.error("Thumbnail upload failed:", thumbnailError);
        toast.error(`Thumbnail upload failed: ${thumbnailError.message}`);
      }

      // Success message based on what was uploaded
      if (backgroundUploadSuccess && thumbnailUploadSuccess) {
        toast.success("Theme created successfully with background and thumbnail!");
      } else if (backgroundUploadSuccess && !thumbnailUploadSuccess) {
        toast.success("Theme created successfully with background, but thumbnail upload failed!");
      } else if (!backgroundUploadSuccess && thumbnailUploadSuccess) {
        toast.success("Theme created successfully with thumbnail!");
      } else if (!downloadedBackgroundFile && thumbnailUploadSuccess) {
        toast.success("Theme created successfully with thumbnail!");
      } else {
        toast.success("Theme created but uploads failed. You can add media later.");
      }

      // Only reset form and files on success
      themeForm.reset();
      setSelectedThumbnailFile(null);
      setShowThumbnailRequiredError(false);
      setDownloadedBackgroundFile(null);
      setBackgroundSource(null);
      setIsDownloadingBackground(false);
      handleClearImportedConfig();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create theme");
      // Do not reset form or files on error - keep user input
    }
  };

  const uploadThemeThumbnail = async (themeId: number, file: File) => {
    const fileType = file.type;
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

    // Request presigned URL
    const presignedData = await trpcClient.admin.upload.requestThemeThumbnailPresignedUrl.mutate({
      themeId,
      contentType: fileType,
      fileExtension: fileExtension,
      fileSize: file.size,
    });

    // Upload to S3
    const uploadResponse = await fetch(presignedData.presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": fileType,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status: ${uploadResponse.status}`);
    }

    // Confirm upload
    await trpcClient.admin.upload.confirmThemeThumbnailUpload.mutate({
      themeId,
      fileId: presignedData.fileId,
      fileName: file.name,
    });
  };

  const uploadThemeBackground = async (themeId: number, file: File) => {
    const fileType = file.type;
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    const mediaType = fileType.startsWith("video/") ? "video" : "image";

    // Request presigned URL for background upload
    const presignedData = await trpcClient.admin.upload.requestAdminThemeBackgroundUrl.mutate({
      themeId,
      contentType: fileType,
      fileExtension: fileExtension,
      fileSize: file.size,
    });

    // Upload to S3
    const uploadResponse = await fetch(presignedData.presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": fileType,
      },
    });

    if (!uploadResponse.ok) {
      throw new Error(`Background upload failed with status: ${uploadResponse.status}`);
    }

    // Confirm upload
    await trpcClient.admin.upload.confirmAdminThemeBackgroundUpload.mutate({
      themeId,
      fileId: presignedData.fileId,
      fileName: file.name,
      mediaType: mediaType as "image" | "video",
    });

    return presignedData.fileId;
  };

  const handleThumbnailFileSelect = useCallback(
    (file: File | null) => {
      setSelectedThumbnailFile(file);
      // Clear the required error when a file is selected
      if (file) {
        setShowThumbnailRequiredError(false);
      }
      // Clear general error messages when user selects/changes thumbnail
      clearErrorMessages();
    },
    [clearErrorMessages]
  );

  const handleImageError = (error: string) => {
    toast.error(error);
  };

  // Handle theme file import
  const handleImportTheme = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        // Validate and parse the theme configuration
        const themeConfig = await importThemeConfigFromJson(file);

        // Extract filename without extension and clean the theme name
        const fileName = file.name
          .replace(/\.ampedtheme$/, "") // Remove extension
          .replace(/[^a-zA-Z]/g, " ") // Remove all non-letter characters (numbers, underscores, etc.)
          .replace(/\s+/g, " ") // Replace multiple spaces with single space
          .trim(); // Remove leading/trailing spaces

        // Set the imported theme config for display and use
        setImportedThemeConfig(themeConfig);
        setIsAccordionOpen(true);

        // Auto-populate the form with the imported theme config and filename
        themeForm.setValue("config", themeConfig);
        themeForm.setValue("name", fileName);

        let backgroundDownloaded = false;
        let thumbnailGenerated = false;

        // Check if the theme has a background and download it
        console.log("Theme config background:", themeConfig.background);
        if (themeConfig.background?.value) {
          const backgroundUrl = themeConfig.background.value;
          const backgroundType = themeConfig.background.type;

          console.log("Attempting to download background:", { backgroundUrl, backgroundType });

          setIsDownloadingBackground(true);

          try {
            // Generate proper filename with extension based on type
            let baseFileName = `background_${fileName}_${Date.now()}`;
            if (backgroundType === "video") {
              // For videos, try to extract extension from URL or default to .mp4
              const urlExtension = backgroundUrl.split(".").pop()?.toLowerCase();
              const validVideoExtensions = ["mp4", "mov", "avi", "webm"];
              const extension = validVideoExtensions.includes(urlExtension || "")
                ? urlExtension
                : "mp4";
              baseFileName = `${baseFileName}.${extension}`;
            } else {
              // For images, try to extract extension from URL or default to .jpg
              const urlExtension = backgroundUrl.split(".").pop()?.toLowerCase();
              const validImageExtensions = ["jpg", "jpeg", "png", "svg"];
              const extension = validImageExtensions.includes(urlExtension || "")
                ? urlExtension
                : "jpg";
              baseFileName = `${baseFileName}.${extension}`;
            }

            // Download the background file silently
            const backgroundFile = await downloadMediaFromUrl(
              backgroundUrl,
              baseFileName,
              backgroundType as "image" | "video"
            );

            console.log("Background file downloaded:", backgroundFile);

            if (backgroundFile) {
              // Validate the downloaded file
              const validation = validateBackgroundFile(backgroundFile);
              if (!validation.isValid) {
                console.warn("Background file validation failed:", validation.error);
                toast.error(`Background validation failed: ${validation.error}`);
              } else {
                setDownloadedBackgroundFile(backgroundFile);
                setBackgroundSource("imported");
                backgroundDownloaded = true;
                console.log("Background file set successfully");

                // Show appropriate success message based on file type
                if (backgroundFile.name.includes("_frame.jpg")) {
                  toast.success(
                    `Video frame extracted successfully! (${(backgroundFile.size / (1024 * 1024)).toFixed(1)}MB)`
                  );
                } else {
                  toast.success(
                    `Background downloaded successfully! (${(backgroundFile.size / (1024 * 1024)).toFixed(1)}MB)`
                  );
                }

                // Generate thumbnail from the background silently
                if (backgroundType === "image") {
                  const thumbnailFile = await createThumbnailFromImageUrl(backgroundUrl);

                  if (thumbnailFile) {
                    setSelectedThumbnailFile(thumbnailFile);
                    thumbnailGenerated = true;
                  }
                } else if (backgroundType === "video") {
                  // For video, use the downloaded file as thumbnail since it's likely a frame
                  if (backgroundFile.name.includes("_frame.jpg")) {
                    setSelectedThumbnailFile(backgroundFile);
                    thumbnailGenerated = true;
                  } else {
                    const thumbnailFile = await createThumbnailFromVideoUrl(backgroundUrl);

                    if (thumbnailFile) {
                      setSelectedThumbnailFile(thumbnailFile);
                      thumbnailGenerated = true;
                    }
                  }
                }
              }
            } else {
              console.warn("Background file download returned null");
              toast.error("Failed to download background file from theme");
            }
          } catch (downloadError: any) {
            console.error("Failed to download background:", downloadError);

            // Check if it's a CORS error
            if (
              downloadError.message?.includes("CORS") ||
              downloadError.message?.includes("cors")
            ) {
              toast.error(
                "CORS error downloading background. You may need to manually upload the background file."
              );
            } else {
              toast.error(`Failed to download background: ${downloadError.message}`);
            }

            // Still try to generate thumbnail even if background download failed
            if (backgroundType === "image") {
              try {
                const thumbnailFile = await createThumbnailFromImageUrl(backgroundUrl);

                if (thumbnailFile) {
                  setSelectedThumbnailFile(thumbnailFile);
                  thumbnailGenerated = true;
                }
              } catch (thumbnailError) {
                console.warn("Thumbnail generation also failed:", thumbnailError);
              }
            } else if (backgroundType === "video") {
              try {
                const thumbnailFile = await createThumbnailFromVideoUrl(backgroundUrl);

                if (thumbnailFile) {
                  setSelectedThumbnailFile(thumbnailFile);
                  thumbnailGenerated = true;
                }
              } catch (thumbnailError) {
                console.warn("Thumbnail generation also failed:", thumbnailError);
              }
            }
          } finally {
            setIsDownloadingBackground(false);
          }
        } else {
          console.log("No background found in theme config or background.value is null/empty");
        }

        // Success message based on what was completed
        if (backgroundDownloaded && thumbnailGenerated) {
          toast.success("Theme imported successfully with background and thumbnail!");
        } else if (backgroundDownloaded && !thumbnailGenerated) {
          toast.success("Theme imported successfully with background!");
        } else if (!backgroundDownloaded && thumbnailGenerated) {
          toast.success(
            "Theme imported successfully with thumbnail! (Background download failed - you can upload manually)"
          );
        } else if (themeConfig.background?.value) {
          toast.success(
            "Theme imported successfully! (Background download failed due to CORS - you can upload manually below)"
          );
        } else {
          toast.success("Theme imported successfully!");
        }

        // Reset the file input to allow selecting the same file again
        e.target.value = "";
      } catch (err: any) {
        toast.error(
          `❌ Failed to import theme: ${err.message || "Invalid .ampedtheme file format"}`
        );
        // Reset the file input
        e.target.value = "";
      }
    },
    [themeForm]
  );

  const handleImportButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClearImportedConfig = useCallback(() => {
    setImportedThemeConfig(null);
    setIsAccordionOpen(false);
    setIsDownloadingBackground(false);
    // Clear the config from the form as well
    themeForm.setValue("config", {});
    // Clear the thumbnail if it was automatically generated from imported theme
    setSelectedThumbnailFile(null);
    setShowThumbnailRequiredError(false);
    // Clear the downloaded background file
    setDownloadedBackgroundFile(null);
    setBackgroundSource(null);
    // Reset file inputs
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = "";
    }
    toast.success("Imported configuration, background, and thumbnail cleared");
  }, [themeForm]);

  // Handle background file selection
  const handleBackgroundFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate the selected background file
    const validation = validateBackgroundFile(file);
    if (!validation.isValid) {
      toast.error(`Background file validation failed: ${validation.error}`);
      e.target.value = ""; // Reset the input
      return;
    }

    setDownloadedBackgroundFile(file);
    setBackgroundSource("manual");
    toast.success(`Background file selected: ${file.name}`);

    // Reset the file input to allow selecting the same file again
    e.target.value = "";
  }, []);

  const handleBackgroundButtonClick = useCallback(() => {
    backgroundFileInputRef.current?.click();
  }, []);

  const handleClearBackgroundFile = useCallback(() => {
    setDownloadedBackgroundFile(null);
    setBackgroundSource(null);
    if (backgroundFileInputRef.current) {
      backgroundFileInputRef.current.value = "";
    }
    toast.success("Background file cleared");
  }, []);

  return (
    <div className="space-y-6">
      {/* Create Theme Section */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Create New Theme</h2>
                  <p className="text-gray-600 mt-1">
                    Create a theme manually or import from an .ampedtheme file
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {importedThemeConfig && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                      <FileText className="h-4 w-4" />
                      <span>Using imported config</span>
                    </div>
                  )}
                  {isDownloadingBackground && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Downloading background...</span>
                    </div>
                  )}
                  {downloadedBackgroundFile && !isDownloadingBackground && (
                    <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                      <ImageIcon className="h-4 w-4" />
                      <span>
                        {downloadedBackgroundFile.name.includes("_frame.jpg")
                          ? `Video frame ready (${(downloadedBackgroundFile.size / (1024 * 1024)).toFixed(1)}MB)`
                          : `Background ready (${(downloadedBackgroundFile.size / (1024 * 1024)).toFixed(1)}MB)`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <form onSubmit={themeForm.handleSubmit(handleThemeSubmit)} className="space-y-4 max-w-xl">
            {/* Import Theme Field */}
            <div>
              <label className="block text-sm font-medium mb-1">Import Theme Configuration</label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportTheme}
                  accept=".ampedtheme"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleImportButtonClick}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  <span>Import .ampedtheme File</span>
                </button>
                {importedThemeConfig && (
                  <button
                    type="button"
                    onClick={handleClearImportedConfig}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Import a .ampedtheme file to auto-populate the form.
              </p>
            </div>

            {/* Accordion for imported theme config */}
            {importedThemeConfig && (
              <div className="border border-gray-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">Imported Theme Configuration</span>
                  </div>
                  {isAccordionOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </button>

                {isAccordionOpen && (
                  <div className="border-t border-gray-200">
                    <div className="p-4 bg-gray-50">
                      <div className="flex items-start space-x-4 mb-3">
                        <div className="flex-1">
                          <p className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Configuration Details:</span>
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                            <div>
                              • Button Style: {importedThemeConfig.buttonStyle || "Not set"}
                            </div>
                            <div>
                              • Container Style: {importedThemeConfig.containerStyle || "Not set"}
                            </div>
                            <div>• Font Family: {importedThemeConfig.fontFamily || "Not set"}</div>
                            <div>• Font Size: {importedThemeConfig.fontSize || "Not set"}</div>
                            <div>
                              • Button Color: {importedThemeConfig.buttonColor || "Not set"}
                            </div>
                            <div>
                              • Background Type: {importedThemeConfig.background?.type || "Not set"}
                            </div>
                            {downloadedBackgroundFile && (
                              <>
                                <div>
                                  • Background:{" "}
                                  {downloadedBackgroundFile.name.includes("_frame.jpg")
                                    ? "🎬 Video Frame"
                                    : "✅ Downloaded"}
                                </div>
                                <div>
                                  • File Size:{" "}
                                  {(downloadedBackgroundFile.size / (1024 * 1024)).toFixed(1)}MB
                                </div>
                              </>
                            )}
                            {importedThemeConfig.background?.value &&
                              !downloadedBackgroundFile &&
                              !isDownloadingBackground && (
                                <>
                                  <div>• Background Download: ❌ Failed</div>
                                  <div>• Background URL: Available below</div>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">JSON Configuration:</p>
                      <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
                        <code className="text-green-400 text-sm whitespace-pre-wrap font-mono">
                          {JSON.stringify(importedThemeConfig, null, 2)}
                        </code>
                      </div>

                      {/* Background URL for manual download */}
                      {importedThemeConfig.background?.value &&
                        !downloadedBackgroundFile &&
                        !isDownloadingBackground && (
                          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-start space-x-2">
                              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <h4 className="text-sm font-medium text-yellow-800 mb-2">
                                  Background Download Failed (CORS Error)
                                </h4>
                                <p className="text-sm text-yellow-700 mb-3">
                                  The background file couldn't be downloaded automatically due to
                                  CORS restrictions. You can download it manually using the URL
                                  below and then upload it using the "Select Background File"
                                  option.
                                </p>
                                <div className="bg-white border border-yellow-300 rounded p-2 mb-3">
                                  <p className="text-xs text-gray-600 mb-1">Background URL:</p>
                                  <code className="text-sm text-gray-800 break-all select-all">
                                    {importedThemeConfig.background.value}
                                  </code>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        importedThemeConfig.background.value
                                      );
                                      toast.success("Background URL copied to clipboard!");
                                    }}
                                    className="inline-flex items-center px-3 py-1 border border-yellow-300 text-sm font-medium rounded text-yellow-700 bg-white hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                                  >
                                    Copy URL
                                  </button>
                                  <a
                                    href={importedThemeConfig.background.value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1 border border-yellow-300 text-sm font-medium rounded text-yellow-700 bg-white hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                                  >
                                    Open in New Tab
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="theme-name">
                Theme Name
              </label>
              <input
                id="theme-name"
                type="text"
                className={`w-full px-3 py-2 border rounded-md ${
                  themeForm.formState.errors.name ? "border-red-500" : "border-gray-300"
                }`}
                {...themeForm.register("name")}
                onChange={createInputHandler(themeForm.register("name"))}
              />
              {themeForm.formState.errors.name && (
                <p className="mt-1 text-sm text-red-600">
                  {themeForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="theme-description">
                Description
              </label>
              <textarea
                id="theme-description"
                className={`w-full px-3 py-2 border rounded-md ${
                  themeForm.formState.errors.description ? "border-red-500" : "border-gray-300"
                }`}
                rows={2}
                placeholder="Theme description (optional)"
                {...themeForm.register("description")}
                onChange={createInputHandler(themeForm.register("description"))}
              />
              {themeForm.formState.errors.description && (
                <p className="mt-1 text-sm text-red-600">
                  {themeForm.formState.errors.description.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="theme-collection">
                Collection *
              </label>
              <select
                id="theme-collection"
                className={`w-full px-3 py-2 border rounded-md ${
                  themeForm.formState.errors.category_id ? "border-red-500" : "border-gray-300"
                }`}
                value={themeForm.watch("category_id") ?? ""}
                onChange={handleCategorySelect}
              >
                <option value="">Select a collection</option>
                {categories?.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.title}
                  </option>
                ))}
              </select>
              {themeForm.formState.errors.category_id && (
                <p className="mt-1 text-sm text-red-600">
                  {themeForm.formState.errors.category_id.message}
                </p>
              )}
            </div>

            {/* Background File Selector */}
            <div>
              <label className="block text-sm font-medium mb-1">Theme Background</label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  ref={backgroundFileInputRef}
                  onChange={handleBackgroundFileSelect}
                  accept="image/*,video/*,.jpg,.jpeg,.png,.svg,.mp4,.mov,.avi,.webm"
                  className="hidden"
                />

                {/* Background selection display */}
                {downloadedBackgroundFile ? (
                  <div className="flex-1 flex items-center justify-between p-3 border border-gray-300 rounded-md bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <ImageIcon className="h-5 w-5 text-gray-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {downloadedBackgroundFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {downloadedBackgroundFile.type.startsWith("video/") ? "Video" : "Image"} •{" "}
                          {(downloadedBackgroundFile.size / (1024 * 1024)).toFixed(1)} MB
                          {backgroundSource === "imported"
                            ? " • From ampedtheme"
                            : " • Manually selected"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleBackgroundButtonClick}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={handleClearBackgroundFile}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleBackgroundButtonClick}
                    className="flex-1 flex items-center justify-center px-3 py-3 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    <span className="text-sm font-medium">Select Background File</span>
                  </button>
                )}
              </div>

              <p className="text-sm text-gray-500 mt-1">
                Select an image or video file for the theme background. Supports JPG, PNG, SVG, MP4,
                MOV, AVI, WebM.
                {!downloadedBackgroundFile && importedThemeConfig?.background?.value && (
                  <span className="text-amber-600 font-medium">
                    {" "}
                    Background will be downloaded from imported theme if not manually selected.
                  </span>
                )}
              </p>
            </div>

            {/* Thumbnail Selector */}
            <div>
              <ThemeThumbnailSelector
                selectedFile={selectedThumbnailFile}
                onFileSelect={handleThumbnailFileSelect}
                onError={handleImageError}
                showRequiredError={showThumbnailRequiredError}
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={themeMutation.status === "pending" || !selectedThumbnailFile}
            >
              {themeMutation.status === "pending" && <Loader2 className="h-4 w-4 animate-spin" />}
              {themeMutation.status === "pending"
                ? downloadedBackgroundFile
                  ? "Creating theme and uploading background + thumbnail..."
                  : "Creating theme and uploading thumbnail..."
                : downloadedBackgroundFile
                  ? "Create Theme with Background & Thumbnail"
                  : "Create Theme with Thumbnail"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
