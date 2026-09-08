/**
 * Utility functions for number formatting
 */

/**
 * Format a number with thousand separators
 * Accepts both string and number inputs
 * Example: "2000000.00" or 2000000.00 becomes "2,000,000.00"
 * @param value - The number as a string or number
 * @returns Formatted number with thousand separators
 */
export function formatNumberWithSeparators(value: string | number): string {
  // Convert to number if it's a string
  const number = typeof value === "string" ? parseFloat(value) : value;

  // Check if it's a valid number
  if (isNaN(number)) {
    return String(value); // Return original if not a valid number
  }

  // Format with thousand separators using Intl.NumberFormat
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}
