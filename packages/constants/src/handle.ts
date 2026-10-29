/**
 * Handle constants shared across applications
 */

// Minimum length for handles (without @ symbol)
export const HANDLE_MIN_LENGTH = 2;

// Maximum length for a new handle. Existing longer handles still resolve.
export const HANDLE_MAX_LENGTH = 64;

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
  | "Taken"
  // Held back by Amped.Bio: a route, a system word or a company word
  | "Reserved";
