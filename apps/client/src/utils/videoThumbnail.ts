/**
 * Video Thumbnail Generation Utilities
 *
 * This utility provides functions to generate thumbnails from video files
 * using the HTML5 video element and canvas in the browser.
 */

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  timeStamp?: number; // Time in seconds to capture frame
  format?: "image/jpeg" | "image/png" | "image/webp";
}

export interface ThumbnailResult {
  dataUrl: string;
  blob: Blob;
  file: File;
}

/**
 * Generate a thumbnail from a video file
 */
export const generateVideoThumbnail = (
  videoFile: File,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult | null> => {
  return new Promise((resolve, reject) => {
    const {
      width = 320,
      height = 240,
      quality = 0.8,
      timeStamp = 1, // 1 second into the video
      format = "image/jpeg",
    } = options;

    // Create video element
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    // Set up video element
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";

    // Clean up function
    const cleanup = () => {
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
    };

    // Handle video load metadata
    video.addEventListener("loadedmetadata", () => {
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Seek to the specified timestamp
      video.currentTime = Math.min(timeStamp, video.duration);
    });

    // Handle seek completion
    video.addEventListener("seeked", () => {
      try {
        // Calculate aspect ratio and drawing dimensions
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;

        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > canvasAspect) {
          // Video is wider - fit to height
          drawHeight = height;
          drawWidth = height * videoAspect;
          offsetX = (width - drawWidth) / 2;
        } else {
          // Video is taller - fit to width
          drawWidth = width;
          drawHeight = width / videoAspect;
          offsetY = (height - drawHeight) / 2;
        }

        // Clear canvas and draw video frame
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Convert to different formats
        canvas.toBlob(
          blob => {
            if (!blob) {
              cleanup();
              console.warn("Failed to create thumbnail blob");
              resolve(null);
              return;
            }

            const dataUrl = canvas.toDataURL(format, quality);
            const file = new File([blob], `thumbnail.${format.split("/")[1]}`, {
              type: format,
              lastModified: Date.now(),
            });

            cleanup();
            resolve({
              dataUrl,
              blob,
              file,
            });
          },
          format,
          quality
        );
      } catch (error) {
        cleanup();
        console.warn("Error generating thumbnail:", error);
        resolve(null);
      }
    });

    // Handle errors
    video.addEventListener("error", error => {
      cleanup();
      console.warn("Video loading error:", error);
      resolve(null); // Return null instead of rejecting
    });

    // Start loading the video
    video.src = URL.createObjectURL(videoFile);
  });
};

/**
 * Generate a thumbnail from a video URL using hidden div approach
 */
export const generateVideoThumbnailFromUrl = (
  videoUrl: string,
  options: ThumbnailOptions = {}
): Promise<ThumbnailResult | null> => {
  return new Promise((resolve, reject) => {
    const {
      width = 320,
      height = 240,
      quality = 0.8,
      timeStamp = 1,
      format = "image/jpeg",
    } = options;

    // Create hidden container div
    const hiddenDiv = document.createElement("div");
    hiddenDiv.style.position = "absolute";
    hiddenDiv.style.left = "-9999px";
    hiddenDiv.style.top = "-9999px";
    hiddenDiv.style.width = "1px";
    hiddenDiv.style.height = "1px";
    hiddenDiv.style.opacity = "0";
    hiddenDiv.style.visibility = "hidden";
    hiddenDiv.style.pointerEvents = "none";

    // Create video element inside hidden div
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.style.width = "100%";
    video.style.height = "100%";

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    // Add video to hidden div and div to document body
    hiddenDiv.appendChild(video);
    document.body.appendChild(hiddenDiv);

    const cleanup = () => {
      if (hiddenDiv.parentNode) {
        hiddenDiv.remove();
      }
    };

    // Handle video load metadata
    video.addEventListener("loadedmetadata", () => {
      canvas.width = width;
      canvas.height = height;
      video.currentTime = Math.min(timeStamp, video.duration);
    });

    // Handle seek completion
    video.addEventListener("seeked", () => {
      try {
        // Calculate aspect ratio and drawing dimensions
        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = width / height;

        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > canvasAspect) {
          drawHeight = height;
          drawWidth = height * videoAspect;
          offsetX = (width - drawWidth) / 2;
        } else {
          drawWidth = width;
          drawHeight = width / videoAspect;
          offsetY = (height - drawHeight) / 2;
        }

        // Clear canvas and draw video frame
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Convert to different formats
        canvas.toBlob(
          blob => {
            cleanup(); // Clean up regardless of success/failure

            if (!blob) {
              console.warn("Failed to create thumbnail blob");
              resolve(null);
              return;
            }

            const dataUrl = canvas.toDataURL(format, quality);
            const file = new File([blob], `thumbnail.${format.split("/")[1]}`, {
              type: format,
              lastModified: Date.now(),
            });

            resolve({
              dataUrl,
              blob,
              file,
            });
          },
          format,
          quality
        );
      } catch (error) {
        cleanup();
        console.warn("Error generating thumbnail:", error);
        resolve(null);
      }
    });

    // Handle errors
    video.addEventListener("error", error => {
      cleanup();
      console.warn("Video loading error:", error);
      resolve(null); // Return null instead of rejecting
    });

    // Start loading the video
    video.src = videoUrl;
  });
};

/**
 * Generate multiple thumbnails from a video at different timestamps
 */
export const generateMultipleVideoThumbnails = async (
  videoFile: File,
  timestamps: number[],
  options: Omit<ThumbnailOptions, "timeStamp"> = {}
): Promise<ThumbnailResult[]> => {
  const results: ThumbnailResult[] = [];

  for (const timestamp of timestamps) {
    try {
      const thumbnail = await generateVideoThumbnail(videoFile, {
        ...options,
        timeStamp: timestamp,
      });

      if (thumbnail) {
        results.push(thumbnail);
      }
    } catch (error) {
      console.warn(`Failed to generate thumbnail at ${timestamp}s:`, error);
    }
  }

  return results;
};

/**
 * Utility function to get video duration
 */
export const getVideoDuration = (videoFile: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");

    video.addEventListener("loadedmetadata", () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    });

    video.addEventListener("error", error => {
      URL.revokeObjectURL(video.src);
      reject(new Error(`Video loading error: ${error}`));
    });

    video.src = URL.createObjectURL(videoFile);
  });
};

/**
 * Utility function to reduce thumbnail quality
 */
export const reduceThumbnailQuality = (
  thumbnailDataUrl: string,
  quality: number = 0.75
): Promise<ThumbnailResult> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error("Failed to reduce thumbnail quality"));
            return;
          }

          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const file = new File([blob], "thumbnail.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });

          resolve({
            dataUrl,
            blob,
            file,
          });
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = thumbnailDataUrl;
  });
};

/**
 * Download a video file from a URL and return as File object using hidden div approach
 * Reuses the video loading logic from thumbnail generation with CORS bypass
 */
export const downloadVideoFromUrl = (videoUrl: string, fileName?: string): Promise<File | null> => {
  return new Promise(resolve => {
    // Create hidden container div
    const hiddenDiv = document.createElement("div");
    hiddenDiv.style.position = "absolute";
    hiddenDiv.style.left = "-9999px";
    hiddenDiv.style.top = "-9999px";
    hiddenDiv.style.width = "1px";
    hiddenDiv.style.height = "1px";
    hiddenDiv.style.opacity = "0";
    hiddenDiv.style.visibility = "hidden";
    hiddenDiv.style.pointerEvents = "none";

    // Create video element inside hidden div
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.style.width = "100%";
    video.style.height = "100%";

    // Add video to hidden div and div to document body
    hiddenDiv.appendChild(video);
    document.body.appendChild(hiddenDiv);

    const cleanup = () => {
      if (hiddenDiv.parentNode) {
        hiddenDiv.remove();
      }
    };

    // Generate filename if not provided or ensure it has proper extension
    if (!fileName) {
      try {
        const urlPath = new URL(videoUrl).pathname;
        const urlFileName = urlPath.split("/").pop() || "";
        if (urlFileName && urlFileName.includes(".")) {
          fileName = urlFileName;
        } else {
          fileName = `video_${Date.now()}.mp4`;
        }
      } catch {
        fileName = `video_${Date.now()}.mp4`;
      }
    } else {
      // Ensure fileName has an extension
      if (!fileName.includes(".")) {
        // Try to get extension from URL
        try {
          const urlPath = new URL(videoUrl).pathname;
          const urlExtension = urlPath.split(".").pop()?.toLowerCase();
          const validExtensions = ["mp4", "mov", "avi", "webm"];
          const extension = validExtensions.includes(urlExtension || "") ? urlExtension : "mp4";
          fileName = `${fileName}.${extension}`;
        } catch {
          fileName = `${fileName}.mp4`;
        }
      }
    }

    // Handle video load metadata - this ensures the video is accessible
    video.addEventListener("loadedmetadata", async () => {
      try {
        // Fetch the video data using the same URL
        const response = await fetch(videoUrl, {
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch video: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();

        // Get content type from response headers or blob
        const contentType = response.headers.get("content-type") || blob.type || "video/mp4";

        const file = new File([blob], fileName!, {
          type: contentType,
          lastModified: Date.now(),
        });

        cleanup();
        resolve(file);
      } catch (error) {
        cleanup();
        console.warn("Error downloading video:", error);
        resolve(null);
      }
    });

    // Handle errors
    video.addEventListener("error", error => {
      cleanup();
      console.warn("Video loading error:", error);
      resolve(null); // Return null instead of rejecting
    });

    // Start loading the video to test accessibility
    video.src = videoUrl;
  });
};

/**
 * Try to download video using different approaches with hidden div container
 */
const downloadVideoUsingMultipleApproaches = async (
  videoUrl: string,
  fileName?: string
): Promise<File | null> => {
  console.log("Attempting video download using hidden div approach:", videoUrl);

  // Approach 1: Try creating a blob URL through hidden video element
  const approach1 = async (): Promise<File | null> => {
    return new Promise(resolve => {
      console.log("Approach 1: Using hidden video element with blob extraction");

      // Create hidden container div
      const hiddenDiv = document.createElement("div");
      hiddenDiv.style.position = "absolute";
      hiddenDiv.style.left = "-9999px";
      hiddenDiv.style.top = "-9999px";
      hiddenDiv.style.width = "1px";
      hiddenDiv.style.height = "1px";
      hiddenDiv.style.opacity = "0";
      hiddenDiv.style.visibility = "hidden";
      hiddenDiv.style.pointerEvents = "none";

      // Create video element inside hidden div
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "auto";
      video.style.width = "100%";
      video.style.height = "100%";

      // Add video to hidden div and div to document body
      hiddenDiv.appendChild(video);
      document.body.appendChild(hiddenDiv);

      const timeoutId = setTimeout(() => {
        hiddenDiv.remove();
        resolve(null);
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (hiddenDiv.parentNode) {
          hiddenDiv.remove();
        }
      };

      video.onloadstart = () => {
        console.log("Video loading started");
      };

      video.onprogress = () => {
        console.log("Video loading progress");
      };

      video.oncanplay = async () => {
        console.log("Video can play - trying to extract blob");

        try {
          // Try to get the video as a blob through canvas recording
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          // Draw a frame
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Create high-quality image from video frame
          canvas.toBlob(
            blob => {
              if (blob) {
                // Generate proper frame filename with correct extension
                let finalFileName;
                if (fileName) {
                  // Remove existing extension and add _frame.jpg
                  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
                  finalFileName = `${nameWithoutExt}_frame.jpg`;
                } else {
                  finalFileName = `video_frame_${Date.now()}.jpg`;
                }
                const file = new File([blob], finalFileName, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });

                console.log("Approach 1 succeeded - created video frame:", file.name, file.size);
                cleanup();
                resolve(file);
              } else {
                cleanup();
                resolve(null);
              }
            },
            "image/jpeg",
            0.95
          );
        } catch (error) {
          console.error("Approach 1 error:", error);
          cleanup();
          resolve(null);
        }
      };

      video.onerror = () => {
        console.warn("Approach 1 failed - video error");
        cleanup();
        resolve(null);
      };

      video.src = videoUrl;
      video.load();
    });
  };

  // Approach 2: Try fetch with different CORS modes
  const approach2 = async (): Promise<File | null> => {
    console.log("Approach 2: Fetch with CORS bypass attempts");

    const corsOptions = [
      { mode: "no-cors" as RequestMode },
      { mode: "cors" as RequestMode },
      { mode: "same-origin" as RequestMode },
    ];

    for (const option of corsOptions) {
      try {
        console.log(`Trying fetch with mode: ${option.mode}`);

        const response = await fetch(videoUrl, {
          mode: option.mode,
          cache: "no-cache",
        });

        if (response.ok || option.mode === "no-cors") {
          const blob = await response.blob();

          if (blob && blob.size > 0) {
            const finalFileName = fileName || `video_${Date.now()}.mp4`;
            const file = new File([blob], finalFileName, {
              type: blob.type || "video/mp4",
              lastModified: Date.now(),
            });

            console.log("Approach 2 succeeded:", file.name, file.size);
            return file;
          }
        }
      } catch (error) {
        console.warn(`Fetch mode ${option.mode} failed:`, error);
        continue;
      }
    }

    return null;
  };

  // Try approaches in order
  console.log("Trying approach 1...");
  let result = await approach1();

  if (!result) {
    console.log("Approach 1 failed, trying approach 2...");
    result = await approach2();
  }

  if (!result) {
    console.log("All approaches failed");
  }

  return result;
};

/**
 * Enhanced video download function with hidden div approach and comprehensive CORS handling
 * This function is specifically designed to avoid CORS errors by using multiple strategies
 */
export const downloadVideoWithHiddenDiv = async (
  videoUrl: string,
  fileName?: string,
  options: {
    extractFrameOnFail?: boolean; // If video download fails, extract a frame as JPG
    timeout?: number; // Timeout in milliseconds
    retryAttempts?: number; // Number of retry attempts
  } = {}
): Promise<{ file: File; type: "video" | "image" } | null> => {
  const { extractFrameOnFail = true, timeout = 30000, retryAttempts = 3 } = options;

  console.log("Downloading video with hidden div approach:", { videoUrl, fileName, options });

  // Try multiple approaches with retries
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    console.log(`Attempt ${attempt}/${retryAttempts} for video download`);

    try {
      // First try the standard video download approach
      const videoFile = await downloadVideoFromUrl(videoUrl, fileName);

      if (videoFile) {
        console.log("Video download succeeded with hidden div approach");
        return { file: videoFile, type: "video" };
      }
    } catch (error) {
      console.warn(`Video download attempt ${attempt} failed:`, error);
    }

    // If video download failed and we want to extract a frame
    if (extractFrameOnFail) {
      console.log("Video download failed, trying frame extraction...");

      try {
        const frameResult = await generateVideoThumbnailFromUrl(videoUrl, {
          width: 1920,
          height: 1080,
          quality: 0.95,
          timeStamp: 1,
          format: "image/jpeg",
        });

        if (frameResult?.file) {
          // Generate proper frame filename with correct extension
          let frameFileName;
          if (fileName) {
            // Remove existing extension and add _frame.jpg
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
            frameFileName = `${nameWithoutExt}_frame.jpg`;
          } else {
            frameFileName = `video_frame_${Date.now()}.jpg`;
          }

          const frameFile = new File([frameResult.blob], frameFileName, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });

          console.log("Frame extraction succeeded as fallback, filename:", frameFileName);
          return { file: frameFile, type: "image" };
        }
      } catch (frameError) {
        console.warn(`Frame extraction attempt ${attempt} failed:`, frameError);
      }
    }

    // Wait before retry (exponential backoff)
    if (attempt < retryAttempts) {
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s...
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.warn("All video download attempts failed");
  return null;
};

/**
 * Download any media file (image or video) from a URL
 * Uses video loading logic for videos and direct fetch for images
 */
export const downloadMediaFromUrl = async (
  mediaUrl: string,
  fileName?: string,
  mediaType?: "image" | "video"
): Promise<File | null> => {
  try {
    console.log("downloadMediaFromUrl called with:", { mediaUrl, fileName, mediaType });

    // Auto-detect media type if not provided
    if (!mediaType) {
      const urlLower = mediaUrl.toLowerCase();
      if (
        urlLower.includes(".mp4") ||
        urlLower.includes(".mov") ||
        urlLower.includes(".webm") ||
        urlLower.includes(".avi")
      ) {
        mediaType = "video";
      } else {
        mediaType = "image";
      }
    }

    console.log("Detected/using media type:", mediaType);

    if (mediaType === "video") {
      // Use the enhanced video download with hidden div approach
      console.log("Using enhanced video download with hidden div approach");
      const result = await downloadVideoWithHiddenDiv(mediaUrl, fileName, {
        extractFrameOnFail: true,
        timeout: 30000,
        retryAttempts: 2,
      });

      if (result) {
        console.log(`Video download succeeded, type: ${result.type}`);
        return result.file;
      }

      console.log("Enhanced video download failed, trying fallback approaches");
      // Fallback to the original video download function
      return await downloadVideoFromUrl(mediaUrl, fileName);
    } else {
      // Use direct fetch for images with CORS fallback strategies
      console.log("Using image download method - fetching:", mediaUrl);

      // Validate URL format
      try {
        new URL(mediaUrl);
      } catch (urlError) {
        throw new Error(`Invalid URL format: ${mediaUrl}`);
      }

      // Try different CORS strategies
      const corsStrategies = [
        { mode: "cors" as RequestMode, description: "CORS mode" },
        { mode: "no-cors" as RequestMode, description: "No-CORS mode" },
        { mode: "same-origin" as RequestMode, description: "Same-origin mode" },
      ];

      for (const strategy of corsStrategies) {
        console.log(`Trying fetch with ${strategy.description}`);

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
          const response = await fetch(mediaUrl, {
            mode: strategy.mode,
            signal: controller.signal,
            headers: {
              Accept: "image/*,video/*,*/*;q=0.8",
            },
          });

          clearTimeout(timeoutId);

          console.log(
            `Fetch response status with ${strategy.description}:`,
            response.status,
            response.statusText
          );
          console.log("Response headers:", Object.fromEntries(response.headers.entries()));

          if (!response.ok) {
            console.warn(
              `Failed with ${strategy.description}: ${response.status} ${response.statusText}`
            );
            continue; // Try next strategy
          }

          const blob = await response.blob();
          const contentType = response.headers.get("content-type") || blob.type;

          console.log("Downloaded blob:", { size: blob.size, type: contentType });

          // Validate blob
          if (blob.size === 0) {
            console.warn(`Empty blob with ${strategy.description}`);
            continue; // Try next strategy
          }

          // Generate filename if not provided
          if (!fileName) {
            const urlPath = new URL(mediaUrl).pathname;
            const urlFileName = urlPath.split("/").pop() || "";
            fileName = urlFileName || `media_${Date.now()}`;

            // Add extension if missing
            if (!fileName.includes(".")) {
              if (contentType.includes("jpeg") || contentType.includes("jpg")) {
                fileName += ".jpg";
              } else if (contentType.includes("png")) {
                fileName += ".png";
              } else if (contentType.includes("svg")) {
                fileName += ".svg";
              } else if (contentType.includes("webp")) {
                fileName += ".webp";
              } else if (contentType.includes("mp4")) {
                fileName += ".mp4";
              } else if (contentType.includes("webm")) {
                fileName += ".webm";
              } else if (contentType.includes("mov")) {
                fileName += ".mov";
              }
            }
          }

          console.log("Creating file with name:", fileName);

          const file = new File([blob], fileName, {
            type: contentType,
            lastModified: Date.now(),
          });

          console.log(`Successfully created file with ${strategy.description}:`, {
            name: file.name,
            size: file.size,
            type: file.type,
          });

          return file;
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          console.warn(`Error with ${strategy.description}:`, fetchError?.message || fetchError);

          if (fetchError?.name === "AbortError") {
            console.warn(`Download timeout with ${strategy.description} after 30 seconds`);
          }

          // Continue to next strategy
          continue;
        }
      }

      // If all strategies failed, throw an error
      throw new Error(
        "Failed to download media with all CORS strategies. The resource may not be accessible due to CORS restrictions or the server may be unreachable."
      );
    }
  } catch (error) {
    console.error("Error downloading media:", error);
    return null;
  }
};
