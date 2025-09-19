/**
 * File upload constants shared across applications
 * Contains size limits, allowed file types and extensions for various upload categories
 */

// Allowed MIME types for avatar uploads (images only)
export const ALLOWED_AVATAR_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
];

// Allowed file extensions for avatar uploads (images only)
export const ALLOWED_AVATAR_IMAGE_FILE_EXTENSIONS = [
  // Images
  "jpg",
  "jpeg",
  "png",
  "svg",
];

// Allowed MIME types for collection thumbnail uploads (images only)
export const ALLOWED_COLLECTION_THUMBNAIL_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
];

// Allowed file extensions for collection thumbnail uploads (images only)
export const ALLOWED_COLLECTION_THUMBNAIL_FILE_EXTENSIONS = [
  // Images
  "jpg",
  "jpeg",
  "png",
  "svg",
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
