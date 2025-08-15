/**
 * File upload constants shared across applications
 * Contains size limits, allowed file types and extensions for various upload categories
 */

// Maximum file size for avatar uploads (5MB)
export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024;

// Maximum file size for background uploads (10MB)
export const MAX_BACKGROUND_FILE_SIZE = 10 * 1024 * 1024;

// Maximum file size for admin avatar uploads (50MB)
export const MAX_ADMIN_AVATAR_FILE_SIZE = 50 * 1024 * 1024;

// Maximum file size for admin background uploads (50MB)
export const MAX_ADMIN_BACKGROUND_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types for avatar uploads (images only)
export const ALLOWED_AVATAR_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
];

// Allowed MIME types for background uploads (images and videos)
export const ALLOWED_BACKGROUND_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  // Videos
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

// Allowed file extensions for avatar uploads (images only)
export const ALLOWED_AVATAR_FILE_EXTENSIONS = [
  // Images
  "jpg",
  "jpeg",
  "png",
  "svg",
];

// Allowed file extensions for background uploads (images and videos)
export const ALLOWED_BACKGROUND_FILE_EXTENSIONS = [
  // Images
  "jpg",
  "jpeg",
  "png",
  "svg",
  // Videos
  "mp4",
  "mov",
  "avi",
  "webm",
];
