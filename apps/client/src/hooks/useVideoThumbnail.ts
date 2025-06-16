import { useState, useCallback } from "react";
import { generateVideoThumbnail, generateVideoThumbnailFromUrl, generateMultipleVideoThumbnails, getVideoDuration, ThumbnailOptions, ThumbnailResult } from "../utils/videoThumbnail";

interface UseVideoThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  timeStamp?: number;
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
  autoGenerate?: boolean; // Automatically generate thumbnail when video changes
}

interface UseVideoThumbnailReturn {
  // State
  isGenerating: boolean;
  error: string | null;
  thumbnails: (ThumbnailResult & { timestamp: number })[];
  videoDuration: number | null;
  
  // Actions
  generateThumbnail: (videoFile: File, options?: ThumbnailOptions) => Promise<ThumbnailResult | null>;
  generateThumbnailFromUrl: (videoUrl: string, options?: ThumbnailOptions) => Promise<ThumbnailResult | null>;
  generateMultiple: (videoFile: File, timestamps: number[], options?: Omit<ThumbnailOptions, 'timeStamp'>) => Promise<void>;
  getVideoDurationFromFile: (videoFile: File) => Promise<number | null>;
  clearThumbnails: () => void;
  clearError: () => void;
}

export function useVideoThumbnail(defaultOptions: UseVideoThumbnailOptions = {}): UseVideoThumbnailReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<(ThumbnailResult & { timestamp: number })[]>([]);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const {
    width = 320,
    height = 240,
    quality = 0.8,
    timeStamp = 1,
    format = 'image/jpeg',
    autoGenerate = false
  } = defaultOptions;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearThumbnails = useCallback(() => {
    setThumbnails([]);
  }, []);

  const generateThumbnail = useCallback(async (
    videoFile: File, 
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const thumbnail = await generateVideoThumbnail(videoFile, {
        width,
        height,
        quality,
        timeStamp,
        format,
        ...options
      });

      if (thumbnail) {
        const thumbnailWithTimestamp = {
          ...thumbnail,
          timestamp: options?.timeStamp || timeStamp
        };

        setThumbnails(prev => [...prev, thumbnailWithTimestamp]);
        return thumbnail;
      } else {
        // Don't set error, just return null
        return null;
      }
    } catch (err) {
      // Don't set error, just log and return null
      console.warn('Failed to generate thumbnail:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [width, height, quality, timeStamp, format]);

  const generateThumbnailFromUrl = useCallback(async (
    videoUrl: string,
    options?: ThumbnailOptions
  ): Promise<ThumbnailResult | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const thumbnail = await generateVideoThumbnailFromUrl(videoUrl, {
        width,
        height,
        quality,
        timeStamp,
        format,
        ...options
      });

      if (thumbnail) {
        const thumbnailWithTimestamp = {
          ...thumbnail,
          timestamp: options?.timeStamp || timeStamp
        };

        setThumbnails(prev => [...prev, thumbnailWithTimestamp]);
        return thumbnail;
      } else {
        // Don't set error, just return null
        return null;
      }
    } catch (err) {
      // Don't set error, just log and return null
      console.warn('Failed to generate thumbnail from URL:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [width, height, quality, timeStamp, format]);

  const generateMultiple = useCallback(async (
    videoFile: File,
    timestamps: number[],
    options?: Omit<ThumbnailOptions, 'timeStamp'>
  ): Promise<void> => {
    setIsGenerating(true);
    setError(null);

    try {
      const results = await generateMultipleVideoThumbnails(videoFile, timestamps, {
        width,
        height,
        quality,
        format,
        ...options
      });

      const thumbnailsWithTimestamps = results.map((result, index) => ({
        ...result,
        timestamp: timestamps[index]
      }));

      setThumbnails(prev => [...prev, ...thumbnailsWithTimestamps]);
    } catch (err) {
      // Don't set error, just log
      console.warn('Failed to generate multiple thumbnails:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [width, height, quality, format]);

  const getVideoDurationFromFile = useCallback(async (videoFile: File): Promise<number | null> => {
    setError(null);

    try {
      const duration = await getVideoDuration(videoFile);
      setVideoDuration(duration);
      return duration;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get video duration';
      setError(errorMessage);
      return null;
    }
  }, []);

  return {
    // State
    isGenerating,
    error,
    thumbnails,
    videoDuration,
    
    // Actions
    generateThumbnail,
    generateThumbnailFromUrl,
    generateMultiple,
    getVideoDurationFromFile,
    clearThumbnails,
    clearError
  };
}
