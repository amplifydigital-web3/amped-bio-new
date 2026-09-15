/**
 * Constants for localStorage keys related to authentication
 * These constants are used throughout the application to maintain
 * consistent naming and avoid typos when accessing localStorage.
 */

export const AUTH_STORAGE_KEYS = {
  /** The JWT authentication token key */
  AUTH_TOKEN: "amped-bio-auth-token",

  /** The authenticated user data key */
  AUTH_USER: "auth-user",
} as const;

export type AuthStorageKey = keyof typeof AUTH_STORAGE_KEYS;
