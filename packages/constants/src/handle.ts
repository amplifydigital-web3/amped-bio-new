/**
 * Handle constants shared across applications
 */

// Minimum length for handles (without @ symbol)
export const HANDLE_MIN_LENGTH = 2;

// Regex pattern for validating handles
export const HANDLE_REGEX = /^[a-z0-9_-]+$/;

// Base URL for handles
export const HANDLE_BASE_URL = "https://amped.bio";

// Types for handle status
export type HandleStatus =
  | "Available"
  | "Unavailable"
  | "Invalid"
  | "TooShort"
  | "Checking"
  | "Unknown"
  | "Current"
  | "Taken";
