/**
 * Utility functions for working with onelinks throughout the application
 */
import { checkOnelinkAvailability } from "@/api/api";

// Constants
const ONELINK_MIN_LENGTH = 3; // Min length without @ symbol
export const ONELINK_REGEX = /^[a-z0-9_-]+$/i;
const BASE_URL = "https://amped-bio.com";

// Types
export type OnelinkStatus =
  | "Available"
  | "Unavailable"
  | "Invalid"
  | "TooShort"
  | "Checking"
  | "Unknown"
  | "Current"
  | "Taken";

// Utility functions

/**
 * Normalize an onelink by removing @ prefix if present
 */
export function normalizeOnelink(onelink: string): string {
  if (!onelink) return "";
  return onelink.startsWith("@") ? onelink.substring(1) : onelink;
}

/**
 * Format an onelink with @ prefix for display
 */
export function formatOnelink(onelink: string): `@${string}` {
  if (!onelink) return "@";
  return onelink.startsWith("@") ? (onelink as `@${string}`) : `@${onelink}`;
}

/**
 * Get the full public URL for an onelink
 */
export function getOnelinkPublicUrl(onelink: string): string {
  if (!onelink) return BASE_URL;
  const formatted = formatOnelink(onelink);
  return `${BASE_URL}/${formatted}`;
}

/**
 * Clean onelink input by removing spaces and special characters
 */
export function cleanOnelinkInput(input: string): string {
  // Remove @ prefix if present
  const withoutAtSymbol = normalizeOnelink(input);

  // Remove spaces and special characters, allowing only a-z, 0-9, underscore and hyphen
  return withoutAtSymbol.replace(/[^a-z0-9_-]/gi, "");
}

/**
 * Validate the format of an onelink (without @ prefix)
 * Only alphanumeric, underscore and hyphen allowed
 */
export function validateOnelinkFormat(onelink: string): boolean {
  return ONELINK_REGEX.test(onelink);
}

/**
 * Validate the length of an onelink
 */
export function validateOnelinkLength(onelink: string): boolean {
  return onelink.length >= ONELINK_MIN_LENGTH;
}

/**
 * Compare two onelinks for equivalence (ignoring @ prefix and case)
 */
export function isEquivalentOnelink(onelink1: string, onelink2: string): boolean {
  if (!onelink1 || !onelink2) return false;
  return normalizeOnelink(onelink1).toLowerCase() === normalizeOnelink(onelink2).toLowerCase();
}

/**
 * Check if an onelink is available via API
 */
export async function checkOnelink(onelink: string): Promise<boolean> {
  try {
    // Normalize to ensure we're sending the version without @ prefix
    const normalizedOnelink = normalizeOnelink(onelink);

    // API call to check availability
    const response = await checkOnelinkAvailability(normalizedOnelink);

    // Return true if available, false if taken
    return response;
  } catch (error) {
    console.error("Error checking onelink availability:", error);
    return false;
  }
}
