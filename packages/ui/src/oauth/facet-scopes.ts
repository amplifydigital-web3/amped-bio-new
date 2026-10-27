// Screen Review 107: facet scopes and the THEY LEARN and THEY DO NOT LEARN
// lists of the facet request card. A facet scope is "facet:<key>".
//
// The server does not offer facet scopes yet (no Authbase proof API, no facet
// scopes in auth.ts). Counsel reviews every string in this file before the
// facet request reaches production.

export const FACET_SCOPE_PREFIX = "facet:";

export type FacetTier = "standard" | "enhanced";

export interface FacetDescription {
  /** Scope key after the prefix, for example age_over_18 */
  key: string;
  /** The fact in plain words, shown at 26/33 */
  label: string;
  /** Where the fact comes from */
  source: string;
  /** First THEY LEARN item: the yes answer */
  answer: string;
  /** First THEY DO NOT LEARN item: the value behind the fact */
  hiddenValue: string;
  /** The Authbase check the owner needs to prove it */
  tier: FacetTier;
}

/** The facets an app may ask for. Keys match the planned facet scopes. */
export const FACET_CATALOG: Record<string, FacetDescription> = {
  age_over_18: {
    key: "age_over_18",
    label: "Over 18",
    source: "From your Age attribute, issued by Authbase",
    answer: "Yes, you are over 18",
    hiddenValue: "Your birthdate",
    tier: "standard",
  },
  residence_us: {
    key: "residence_us",
    label: "Lives in the US",
    source: "From your Residence attribute, issued by Authbase",
    answer: "Yes, you live in the US",
    hiddenValue: "Your address",
    tier: "enhanced",
  },
};

export function isFacetScope(scope: string): boolean {
  return scope.startsWith(FACET_SCOPE_PREFIX);
}

/** The catalog entry for a facet scope, or null when the scope is not a known facet. */
export function describeFacetScope(scope: string): FacetDescription | null {
  if (!isFacetScope(scope)) return null;
  return FACET_CATALOG[scope.slice(FACET_SCOPE_PREFIX.length)] ?? null;
}

export interface FacetLearnLists {
  learn: string[];
  notLearn: string[];
}

/**
 * 107 I03: both lists come from every scope in the request, not from the facet
 * alone, so they never contradict what the app receives.
 * - profile returns the name, picture and wallet address (auth.ts userinfo and
 *   access token), so those move to THEY LEARN and wallet history leaves THEY
 *   DO NOT LEARN (a wallet address exposes its history on chain).
 * - email returns the email address.
 * A facet only request keeps the board's lists.
 */
export function buildFacetLearnLists(scopes: string[], facet: FacetDescription): FacetLearnLists {
  const hasProfile = scopes.includes("profile");
  const hasEmail = scopes.includes("email");

  const learn = [facet.answer];
  if (hasProfile) learn.push("Your name and profile picture", "Your wallet address");
  if (hasEmail) learn.push("Your email address");
  learn.push("Authbase checked it", "Made for this request only");

  const notLearn = [facet.hiddenValue];
  if (hasProfile) {
    notLearn.push("Your ID number");
  } else {
    notLearn.push("Your name or ID number", "Your wallet history");
  }

  return { learn, notLearn };
}

/** 107 I07: the expiry line reads the server value, never a fixed "10 minutes". */
export function formatProofLifetime(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 60) return whole === 1 ? "1 second" : `${whole} seconds`;
  if (whole < 3600) {
    const minutes = Math.round(whole / 60);
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }
  const hours = Math.round(whole / 3600);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}
