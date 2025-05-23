/**
 * File upload constants shared across applications
 */

// Maximum file size for uploads (10MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types for file uploads
export const ALLOWED_FILE_TYPES = [
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

// Allowed file extensions for uploads
export const ALLOWED_FILE_EXTENSIONS = [
  // Images
  "jpg", "jpeg", "png", "svg", 
  // Videos
  "mp4", "mov", "avi", "webm"
];
