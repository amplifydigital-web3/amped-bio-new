/**
 * Email verification grace, shared by server and client.
 *
 * Rob, 2026-10-10: a new account may use features that used to wait for a
 * verified email (broadcasts, counted follows) right away. Verification is
 * required once the account is EMAIL_VERIFICATION_GRACE_DAYS old, or sooner
 * once usage passes a milestone. Each gated feature names its own milestone
 * here so the numbers live in one place.
 */

/** Days after sign up during which an unverified account is trusted. */
export const EMAIL_VERIFICATION_GRACE_DAYS = 30;

/** Broadcasts an unverified creator may send before verification is required. */
export const EMAIL_VERIFICATION_GRACE_BROADCASTS = 3;

export type VerificationRequiredReason = "expired" | "milestone";

/** What a gated feature tells the client about the caller's verification. */
export type VerificationGate = {
  verified: boolean;
  /** True when the feature is held until the email is verified. */
  required: boolean;
  reason: VerificationRequiredReason | null;
  /** ISO date when the grace period ends. Null once verified. */
  graceEndsAt: string | null;
};
