/**
 * Compliance constants for gating and content copy (content gating spec 4.3,
 * OB-Q36 and OB-Q62). Every surface imports these; no surface types the text.
 */

/**
 * Shown on every unlock step, locked card and locked page for a stake rule
 * (pool_member, stake_min, or any and all with a stake leaf), directly below
 * TESTNET_NOTICE. Draft text: counsel has not returned it yet (content gating
 * spec, For counsel). No board may show it as final until then.
 */
export const ACCESS_STAKE_DISCLOSURE =
  "Access is not something you buy with a stake. It stays open while your stake in this pool meets the creator's rule and closes when it does not. Staking tREVO carries risk.";

/** Words that never appear on content and store surfaces (content spec copy rules). */
export const CONTENT_BANNED_TERMS = [
  "earn",
  "yield",
  "return",
  "profit",
  "invest",
  "investment",
  "passive income",
  "income",
  "gains",
  "APY",
  "APR",
  "interest",
  "ROI",
] as const;

/** Stake gate surfaces add these: a stake is not a purchase and not a membership. */
export const ACCESS_BANNED_TERMS = [
  ...CONTENT_BANNED_TERMS,
  "member",
  "members",
  "membership",
  "buy",
  "purchase",
  "price",
] as const;

/** Amped.Bio's platform fee for Paid and Members, in basis points (5.00%). */
export const PLATFORM_FEE_BPS = 500;

/**
 * Banned terms found in a string, matched as whole words or phrases and case
 * insensitive. The disclosure is removed first, because the approved counsel
 * text is the one place a banned word may appear.
 */
export function findComplianceTerms(text: string, terms: readonly string[]): string[] {
  const body = text.split(ACCESS_STAKE_DISCLOSURE).join(" ").toLowerCase();
  return terms.filter(term => {
    const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(body);
  });
}
