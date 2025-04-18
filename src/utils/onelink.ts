/**
 * Utility functions for working with onelinks throughout the application
 */
import { checkOnelinkAvailability } from "@/api/api";

// Constants
const ONELINK_PREFIX = "@";
const ONELINK_MIN_LENGTH = 1; // Min length without @ symbol
export const ONELINK_REGEX = /^[a-zA-Z0-9_@-]+$/;

// Types
export type OnelinkStatus =
  | "Unknown"
  | "Checking..."
  | "Available"
  | "Unavailable"
  | "Invalid"
  | "TooShort";

// Utility functions

/**
 * Normalize a onelink by removing @ prefix and trimming
 */
export const normalizeOnelink = (onelink: string): string => {
  return onelink.replace(/^@+/, "").trim();
};

/**
 * Format a onelink with @ prefix
 */
export const formatOnelink = (onelink: string): string => {
  const normalized = normalizeOnelink(onelink);
  return normalized ? `${ONELINK_PREFIX}${normalized}` : "";
};

/**
 * Validate if a onelink string is valid (follows character rules)
 */
export const validateOnelinkFormat = (onelink: string): boolean => {
  const normalized = normalizeOnelink(onelink);
  return ONELINK_REGEX.test(normalized);
};

/**
 * Validate if a onelink has minimum required length
 */
export const validateOnelinkLength = (onelink: string): boolean => {
  const normalized = normalizeOnelink(onelink);
  return normalized.length >= ONELINK_MIN_LENGTH;
};

/**
 * Clean an input onelink to ensure it has valid characters
 */
export const cleanOnelinkInput = (onelink: string): string => {
  const normalized = normalizeOnelink(onelink);
  return normalized.replace(/[^a-zA-Z0-9_@-]/g, "");
};

/**
 * Check if a onelink is available (not already taken)
 * @returns Promise resolving to a boolean indicating availability
 */
export const checkOnelink = async (onelink: string): Promise<boolean> => {
  const normalized = normalizeOnelink(onelink);
  if (!validateOnelinkFormat(normalized) || !validateOnelinkLength(normalized)) {
    return false;
  }
  return await checkOnelinkAvailability(normalized);
};

/**
 * Get the full public URL for a onelink
 */
export const getOnelinkPublicUrl = (onelink: string): string => {
  const normalized = normalizeOnelink(onelink);
  return normalized ? `amped-bio.com/${formatOnelink(normalized)}` : "";
};

/**
 * Determine if two onelinks are equivalent (accounting for @ prefixes)
 */
export const isEquivalentOnelink = (onelink1: string, onelink2: string): boolean => {
  return normalizeOnelink(onelink1) === normalizeOnelink(onelink2);
};
