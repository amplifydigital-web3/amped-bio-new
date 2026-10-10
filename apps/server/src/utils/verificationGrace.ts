import type { Prisma } from "@repo/database";
import { EMAIL_VERIFICATION_GRACE_DAYS, type VerificationGate } from "@repo/constants";

/**
 * Email verification grace (Rob, 2026-10-10).
 *
 * An unverified account is trusted for EMAIL_VERIFICATION_GRACE_DAYS after
 * sign up. The Prisma filter and the in-memory check must stay equivalent,
 * so both live here. Features with a usage milestone pass `milestoneReached`
 * to end the grace early.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type VerificationFields = { email_verified: boolean; created_at: Date };

/** Accounts created after this instant are still inside the grace period. */
export function verificationGraceCutoff(now = new Date()): Date {
  return new Date(now.getTime() - EMAIL_VERIFICATION_GRACE_DAYS * DAY_MS);
}

/** Prisma filter: verified, or still inside the grace period. */
export function trustedEmailWhere(now = new Date()): Prisma.UserWhereInput {
  return { OR: [{ email_verified: true }, { created_at: { gt: verificationGraceCutoff(now) } }] };
}

export function graceEndsAt(user: VerificationFields): Date {
  return new Date(user.created_at.getTime() + EMAIL_VERIFICATION_GRACE_DAYS * DAY_MS);
}

/** True when the account may act without a verified email right now. */
export function hasEmailTrust(user: VerificationFields, now = new Date()): boolean {
  return user.email_verified || user.created_at > verificationGraceCutoff(now);
}

/**
 * The gate a feature returns to the client. `milestoneReached` is the
 * feature's own usage threshold (for example broadcasts already sent).
 */
export function verificationGate(
  user: VerificationFields,
  { milestoneReached = false, now = new Date() } = {}
): VerificationGate {
  if (user.email_verified) {
    return { verified: true, required: false, reason: null, graceEndsAt: null };
  }
  const ends = graceEndsAt(user);
  if (ends <= now) {
    return { verified: false, required: true, reason: "expired", graceEndsAt: ends.toISOString() };
  }
  if (milestoneReached) {
    return {
      verified: false,
      required: true,
      reason: "milestone",
      graceEndsAt: ends.toISOString(),
    };
  }
  return { verified: false, required: false, reason: null, graceEndsAt: ends.toISOString() };
}
