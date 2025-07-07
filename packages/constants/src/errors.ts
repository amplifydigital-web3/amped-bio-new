/**
 * Error constants shared between client and server
 */

export const ERROR_CAUSES = {
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
} as const;

export type ErrorCause = (typeof ERROR_CAUSES)[keyof typeof ERROR_CAUSES];
