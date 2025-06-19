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
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
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
      format = 'image/jpeg'
    } = options;

    // Create video element
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    // Set up video element
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    // Clean up function
    const cleanup = () => {
      if (video.src) {
        URL.revokeObjectURL(video.src);
      }
    };

    // Handle video load metadata
    video.addEventListener('loadedmetadata', () => {
      // Set canvas dimensions
      canvas.width = width;
      canvas.height = height;

      // Seek to the specified timestamp
      video.currentTime = Math.min(timeStamp, video.duration);
    });

    // Handle seek completion
    video.addEventListener('seeked', () => {
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
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Convert to different formats
        canvas.toBlob((blob) => {
          if (!blob) {
            cleanup();
            console.warn('Failed to create thumbnail blob');
            resolve(null);
            return;
          }

          const dataUrl = canvas.toDataURL(format, quality);
          const file = new File([blob], `thumbnail.${format.split('/')[1]}`, {
            type: format,
            lastModified: Date.now(),
          });

          cleanup();
          resolve({
            dataUrl,
            blob,
            file
          });
        }, format, quality);

      } catch (error) {
        cleanup();
        console.warn('Error generating thumbnail:', error);
        resolve(null);
      }
    });

    // Handle errors
    video.addEventListener('error', (error) => {
      cleanup();
      console.warn('Video loading error:', error);
      resolve(null); // Return null instead of rejecting
    });

    // Start loading the video
    video.src = URL.createObjectURL(videoFile);
  });
};

/**
 * Generate a thumbnail from a video URL
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
      format = 'image/jpeg'
    } = options;

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    // Set up video element
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';

    // Handle video load metadata
    video.addEventListener('loadedmetadata', () => {
      canvas.width = width;
      canvas.height = height;
      video.currentTime = Math.min(timeStamp, video.duration);
    });

    // Handle seek completion
    video.addEventListener('seeked', () => {
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
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        // Convert to different formats
        canvas.toBlob((blob) => {
          if (!blob) {
            console.warn('Failed to create thumbnail blob');
            resolve(null);
            return;
          }

          const dataUrl = canvas.toDataURL(format, quality);
          const file = new File([blob], `thumbnail.${format.split('/')[1]}`, {
            type: format,
            lastModified: Date.now(),
          });

          resolve({
            dataUrl,
            blob,
            file
          });
        }, format, quality);

      } catch (error) {
        console.warn('Error generating thumbnail:', error);
        resolve(null);
      }
    });

    // Handle errors
    video.addEventListener('error', (error) => {
      console.warn('Video loading error:', error);
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
  options: Omit<ThumbnailOptions, 'timeStamp'> = {}
): Promise<ThumbnailResult[]> => {
  const results: ThumbnailResult[] = [];
  
  for (const timestamp of timestamps) {
    try {
      const thumbnail = await generateVideoThumbnail(videoFile, {
        ...options,
        timeStamp: timestamp
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
    const video = document.createElement('video');
    
    video.addEventListener('loadedmetadata', () => {
      const duration = video.duration;
      URL.revokeObjectURL(video.src);
      resolve(duration);
    });

    video.addEventListener('error', (error) => {
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
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    if (!ctx) {
      reject(new Error('Canvas context not available'));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to reduce thumbnail quality'));
          return;
        }

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const file = new File([blob], 'thumbnail.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        resolve({
          dataUrl,
          blob,
          file
        });
      }, 'image/jpeg', quality);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = thumbnailDataUrl;
  });
};
