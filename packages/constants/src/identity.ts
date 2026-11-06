/**
 * Identity checks through Authbase (Build Board #47, docs/features/identity-checks.md).
 * Shared by the server, which runs the checks, and the client, which shows the
 * Over 18 sheet and the Get paid card.
 */

export const IDENTITY_CHECK_KINDS = ["age_over_18", "seller"] as const;
export type IdentityCheckKind = (typeof IDENTITY_CHECK_KINDS)[number];

export const IDENTITY_FAIL_REASONS = [
  // The account has no Amped wallet
  "no_wallet",
  // Authbase NOT_LINKED
  "not_linked",
  // Authbase NOT_VERIFIED, includes an expired verification
  "not_verified",
  // Verified, but Over 18 is not shared with Amped.Bio (age only)
  "not_shared",
  // Over 18 is false (age only)
  "under_18",
  // Seller only: no RNS name on the account, or the name is not registered
  "no_name",
  // Seller only: the RNS name is past its expiry (the grace period does not count)
  "name_expired",
  // Seller only: the name's owner or resolver address is not the wallet
  "name_not_bound",
  // Seller only: verified with Standard; selling needs Enhanced unless an Amped.Bio admin set an
  // override (M10, docs/features/authbase-storefront.md 3.2b)
  "needs_enhanced",
  // Authbase or the chain could not be read, or Authbase is not configured. Never passes.
  "unavailable",
] as const;
export type IdentityFailReason = (typeof IDENTITY_FAIL_REASONS)[number];

export type IdentityTier = "STANDARD" | "ENHANCED";

export type IdentityCheckResult =
  /** overrideUntil: a seller pass on Standard that an Amped.Bio admin allowed until this date */
  | { pass: true; validUntil: Date; tier: IdentityTier; overrideUntil?: Date }
  | { pass: false; reason: IdentityFailReason };

/** The longest an admin can allow a creator to sell with Standard (M10). */
export const SELLER_OVERRIDE_MAX_DAYS = 365;
/** The creator gets a reminder this long before an override ends. */
export const SELLER_OVERRIDE_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

/** A pass is reused until the earlier of its valid until date and this long after the check. */
export const IDENTITY_PASS_CACHE_MS = 24 * 60 * 60 * 1000;
/** A fail (other than unavailable) is reused this long. */
export const IDENTITY_FAIL_CACHE_MS = 5 * 60 * 1000;
/** identity.recheck calls allowed per user per minute (Authbase answers 429 under load). */
export const IDENTITY_RECHECK_PER_MINUTE = 6;
