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

// ----------------------------------------------------------------------------
// 18+ statutory notices (adult content review 9, AD-D1, PR C1 with A1)
// ----------------------------------------------------------------------------

/**
 * Alabama Act 2024 HB 164 (enrolled), Section 9(a)(1), verbatim. Interim, pending
 * counsel: shown to every viewer on the Over 18 sheet before the check passes and
 * on the 18+ shelf landing. Statute text: never edited, exempt from the dash and
 * banned word checks, and typed nowhere else. A test compares it byte for byte
 * with docs/features/adult-content-review.md section 9.
 */
export const ALABAMA_HEALTH_WARNINGS = [
  "ALABAMA HEALTH AND HUMAN SERVICES WARNING: Pornography is potentially biologically addictive, is proven to harm human brain development, desensitizes brain reward circuits, increases conditioned responses, and weakens brain function.",
  "ALABAMA HEALTH AND HUMAN SERVICES WARNING: Exposure to this content is associated with low self-esteem and body image, eating disorders, impaired brain development, and other emotional and mental illnesses.",
  "ALABAMA HEALTH AND HUMAN SERVICES WARNING: Pornography increases the demand for prostitution, child exploitation, and child pornography.",
] as const;

/** Section 9(a)(2), verbatim. Shown on every 18+ page: the shelf and every 18+ item page. */
export const SAMHSA_HELPLINE_NOTICE = [
  "U.S. SUBSTANCE ABUSE AND MENTAL HEALTH SERVICES ADMINISTRATION HELPLINE: 1-800-662-HELP (4357)",
  "THIS HELPLINE IS A FREE, CONFIDENTIAL INFORMATION SERVICE (IN ENGLISH OR SPANISH) OPEN 24 HOURS PER DAY, FOR INDIVIDUALS AND FAMILY MEMBERS FACING MENTAL HEALTH OR SUBSTANCE USE DISORDERS. THE SERVICE PROVIDES REFERRAL TO LOCAL TREATMENT FACILITIES, SUPPORT GROUPS, AND COMMUNITY-BASED ORGANIZATIONS.",
] as const;
