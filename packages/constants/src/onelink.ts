/**
 * Onelink constants shared across applications
 */

// Minimum length for onelinks (without @ symbol)
export const ONELINK_MIN_LENGTH = 2;

// Regex pattern for validating onelinks
export const ONELINK_REGEX = /^[a-zA-Z0-9_-]+$/i;

// Base URL for onelinks
export const ONELINK_BASE_URL = "https://amped.bio";

// Types for onelink status
export type OnelinkStatus =
  | "Available"
  | "Unavailable"
  | "Invalid"
  | "TooShort"
  | "Checking"
  | "Unknown"
  | "Current"
  | "Taken";
