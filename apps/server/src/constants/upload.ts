/**
 * File upload constants shared across the application
 */

// Maximum file size for uploads (5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types for image uploads
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png', 
  'image/svg+xml'
];

// Allowed file extensions for image uploads
export const ALLOWED_FILE_EXTENSIONS = [
  'jpg', 
  'jpeg', 
  'png', 
  'svg'
];