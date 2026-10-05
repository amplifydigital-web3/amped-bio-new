/**
 * Utility functions for formatting data in the admin dashboard
 */

/**
 * Format user role for display with appropriate styling classes
 */
export function formatUserRole(role: string): { label: string; className: string } {
  switch (role.toLowerCase()) {
    case "admin":
      return {
        label: "Admin",
        className: "bg-purple-100 text-purple-800",
      };
    case "moderator":
      return {
        label: "Moderator",
        className: "bg-blue-100 text-blue-800",
      };
    default:
      return {
        label: "User",
        className: "bg-green-100 text-green-800",
      };
  }
}

/**
 * Format user status (block/active) for display with appropriate styling classes
 */
export function formatUserStatus(status: string): { label: string; className: string } {
  const isBlocked = status === "yes";

  return {
    label: isBlocked ? "Blocked" : "Active",
    className: isBlocked ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800",
  };
}

/**
 * Format date for display in admin panels
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format number with compact notation (K, M, B) for large numbers
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: num > 9999 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(num);
}
