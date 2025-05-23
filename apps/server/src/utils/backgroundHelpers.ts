import { s3Service } from '../services/S3Service';

/**
 * Checks if a background URL is a user-uploaded custom background
 * by examining the URL pattern. Custom backgrounds are typically stored
 * in S3 with a path that includes 'theme_', the theme ID, and a timestamp.
 * 
 * @param url The URL or file key to check
 * @returns True if the background appears to be a custom user upload
 */
export const isCustomUserBackground = (url: string | null): boolean => {
  if (!url) return false;
  
  // Extract key from URL if it's a full URL
  const fileKey = s3Service.extractFileKeyFromUrl(url);
  if (!fileKey) return false;
  
  // Check for the pattern used for user uploaded backgrounds
  // The pattern is typically: backgrounds/theme_{themeId}_{timestamp}.{ext}
  return (
    fileKey.startsWith('backgrounds/theme_') && 
    // Additional check: Make sure it's not one of our standard backgrounds
    !fileKey.includes('/themes/backgrounds/')
  );
};

/**
 * Safely deletes a background from S3 if it's a user-uploaded custom background
 * 
 * @param url The URL or file key of the background to delete
 * @returns A promise that resolves when the delete operation completes or is skipped
 */
export const deleteCustomBackgroundIfNeeded = async (url: string | null): Promise<void> => {
  if (!url || !isCustomUserBackground(url)) {
    return; // Not a custom background, nothing to delete
  }
  
  const fileKey = s3Service.extractFileKeyFromUrl(url);
  if (!fileKey) return;
  
  try {
    await s3Service.deleteFile(fileKey);
    console.info('[INFO] Deleted custom background:', fileKey);
  } catch (error) {
    console.warn('[WARN] Failed to delete custom background:', error, { fileKey });
  }
};
