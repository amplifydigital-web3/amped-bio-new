import {
  HANDLE_MIN_LENGTH,
  HANDLE_REGEX,
  HANDLE_BASE_URL,
  HandleStatus,
} from "@repo/constants";
import { trpcClient } from "./trpc";

export type { HandleStatus };

// Base URL for handles
const BASE_URL = HANDLE_BASE_URL;

// Utility functions

/**
 * Normalize an handle by removing @ prefix if present and lowercasing
 */
export function normalizeHandle(handle: string): string {
  if (!handle) return "";
  let normalized = handle.trim();
  if (normalized.startsWith("@")) {
    normalized = normalized.substring(1);
  }
  return normalized.toLowerCase();
}

/**
 * Format an handle with @ prefix for display
 */
export function formatHandle(normalizedHandle: string): string {
  if (!normalizedHandle) return "@";
  const normalized = normalizeHandle(normalizedHandle);
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

/**
 * Get the full public URL for an handle
 */
export function getHandlePublicUrl(normalizedOrFormattedHandle: string): string {
  if (!normalizedOrFormattedHandle) return BASE_URL;
  const formattedHandle = formatHandle(normalizeHandle(normalizedOrFormattedHandle));
  return `${BASE_URL}/${formattedHandle}`;
}

/**
 * Clean handle input by removing spaces and special characters
 */
export function cleanHandleInput(rawInput: string): string {
  // Remove whitespace and convert to lowercase
  const normalizedHandle = normalizeHandle(rawInput);

  // Remove any invalid characters (keep only lowercase alphanumeric, underscore, hyphen)
  return normalizedHandle.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/**
 * Validate the format of an handle (without @ prefix)
 * Only alphanumeric, underscore and hyphen allowed
 */
export function validateHandleFormat(normalizedHandle: string): boolean {
  return HANDLE_REGEX.test(normalizedHandle);
}

/**
 * Validate the length of an handle
 */
export function validateHandleLength(normalizedHandle: string): boolean {
  return normalizedHandle.length >= HANDLE_MIN_LENGTH;
}

/**
 * Compare two handles for equivalence (ignoring @ prefix and case)
 */
export function isEquivalentHandle(rawHandle1: string, rawHandle2: string): boolean {
  if (!rawHandle1 || !rawHandle2) return false;

  return normalizeHandle(rawHandle1) === normalizeHandle(rawHandle2);
}

/**
 * Check if an handle is available via API
 */
export async function checkHandle(rawHandle: string): Promise<boolean> {
  try {
    const normalizedHandle = normalizeHandle(rawHandle);

    // API call to check availability
    const response = await trpcClient.handle.checkAvailability.query({
      handle: normalizedHandle,
    });

    // Return true if available, false if taken
    return response.available;
  } catch (error) {
    console.error("Error checking handle availability:", error);
    return false;
  }
}
