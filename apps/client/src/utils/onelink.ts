import {
  ONELINK_MIN_LENGTH,
  ONELINK_REGEX,
  ONELINK_BASE_URL,
  OnelinkStatus,
} from "@ampedbio/constants";
import { trpcClient } from "./trpc";

// Constants
const BASE_URL = ONELINK_BASE_URL;

// Types
export type { OnelinkStatus };

// Utility functions

/**
 * Normalize an onelink by removing @ prefix if present
 */
export function normalizeOnelink(rawOnelink: string): string {
  if (!rawOnelink) return "";
  return rawOnelink.startsWith("@") ? rawOnelink.substring(1) : rawOnelink;
}

/**
 * Format an onelink with @ prefix for display
 */
export function formatOnelink(normalizedOnelink: string): `@${string}` {
  if (!normalizedOnelink) return "@";
  return normalizedOnelink.startsWith("@")
    ? (normalizedOnelink as `@${string}`)
    : `@${normalizedOnelink}`;
}

/**
 * Get the full public URL for an onelink
 */
export function getOnelinkPublicUrl(normalizedOrFormattedOnelink: string): string {
  if (!normalizedOrFormattedOnelink) return BASE_URL;
  const formattedOnelink = formatOnelink(normalizeOnelink(normalizedOrFormattedOnelink));
  return `${BASE_URL}/${formattedOnelink}`;
}

/**
 * Clean onelink input by removing spaces and special characters
 */
export function cleanOnelinkInput(rawInput: string): string {
  // Remove @ prefix if present
  const normalizedOnelink = normalizeOnelink(rawInput);

  // Remove spaces and special characters, allowing only a-z, 0-9, underscore and hyphen
  return normalizedOnelink.replace(/[^a-z0-9_-]/gi, "");
}

/**
 * Validate the format of an onelink (without @ prefix)
 * Only alphanumeric, underscore and hyphen allowed
 */
export function validateOnelinkFormat(normalizedOnelink: string): boolean {
  return ONELINK_REGEX.test(normalizedOnelink);
}

/**
 * Validate the length of an onelink
 */
export function validateOnelinkLength(normalizedOnelink: string): boolean {
  return normalizedOnelink.length >= ONELINK_MIN_LENGTH;
}

/**
 * Compare two onelinks for equivalence (ignoring @ prefix and case)
 */
export function isEquivalentOnelink(rawOnelink1: string, rawOnelink2: string): boolean {
  if (!rawOnelink1 || !rawOnelink2) return false;
  return (
    normalizeOnelink(rawOnelink1).toLowerCase() === normalizeOnelink(rawOnelink2).toLowerCase()
  );
}

/**
 * Check if an onelink is available via API
 */
export async function checkOnelink(rawOnelink: string): Promise<boolean> {
  try {
    // Normalize to ensure we're sending the version without @ prefix
    const normalizedOnelink = normalizeOnelink(rawOnelink);

    // API call to check availability
    const response = await trpcClient.onelink.checkAvailability.query({
      onelink: normalizedOnelink,
    });

    // Return true if available, false if taken
    return response.available;
  } catch (error) {
    console.error("Error checking onelink availability:", error);
    return false;
  }
}
