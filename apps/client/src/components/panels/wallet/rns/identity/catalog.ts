import {
  BadgeCheck,
  Cake,
  Fingerprint,
  Flag,
  Home,
  Landmark,
  ScrollText,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * Screen Review 105: the planned attributes, verbatim. Counsel reads this list
 * before the Soon tabs reach production (105 I11). Labels and issuer lines are
 * not descriptions of shipped features.
 */
export type PlannedAttribute = {
  key: string;
  label: string;
  from: string;
  facets: string[];
  icon: LucideIcon;
};

export const PLANNED_ATTRIBUTES: PlannedAttribute[] = [
  {
    key: "age",
    label: "Age (from date of birth)",
    from: "Authbase ID check",
    facets: ["Over 18", "Over 21"],
    icon: Cake,
  },
  { key: "kyc", label: "KYC", from: "Authbase", facets: ["Identity checked"], icon: UserCheck },
  {
    key: "aml",
    label: "AML screening",
    from: "Authbase",
    facets: ["Not on sanctions lists", "Not a politically exposed person"],
    icon: ShieldCheck,
  },
  {
    key: "residence",
    label: "Residence",
    from: "Authbase address check",
    facets: ["Lives in the US", "Not in a restricted region"],
    icon: Home,
  },
  {
    key: "citizenship",
    label: "Citizenship",
    from: "Authbase ID check",
    facets: ["US citizen", "EU citizen"],
    icon: Flag,
  },
  {
    key: "unique",
    label: "Unique person",
    from: "Authbase",
    facets: ["One person, one account"],
    icon: Fingerprint,
  },
  {
    key: "accredited",
    label: "Accredited investor (US)",
    from: "A licensed verifier",
    facets: ["Accredited"],
    icon: Landmark,
  },
  {
    key: "socials",
    label: "Verified socials",
    from: "Account ownership check",
    facets: ["Owns @maya.lin on X", "Owns Instagram account"],
    icon: BadgeCheck,
  },
  {
    key: "license",
    label: "Professional license",
    from: "Licensing body",
    facets: ["Licensed professional"],
    icon: ScrollText,
  },
];

/** Screen Review 106: the owner's future facets, read only in the placeholder phase. */
export const PLANNED_FACETS: { label: string; from: string }[] = [
  { label: "Over 18", from: "From Age" },
  { label: "Identity checked", from: "From KYC" },
  { label: "Not on sanctions lists", from: "From AML screening" },
  { label: "Lives in the US", from: "From Residence" },
  { label: "One person, one account", from: "From Unique person" },
];

/** 106 I06: planned uses, one line each. Not shipped features. */
export const PLANNED_USES: { title: string; body: string }[] = [
  { title: "On your page", body: "Show chips like Over 18 next to your RNS name." },
  { title: "Gated pools", body: "A creator can require Over 18 to stake in a pool." },
  { title: "Fan perks", body: "Unlock age or region limited drops without a form." },
  {
    title: "Sign in with Amped.Bio",
    body: "Apps ask for a facet. You approve. They get a proof, not your data.",
  },
  {
    title: "Private messages",
    body: "Send a message that carries a facet, like From a verified fan, without revealing who you are.",
  },
  {
    title: "Payments",
    body: "Attach Verified owner to a transfer so the recipient knows it came from a real person.",
  },
];

/** Authbase site for linking, the ID check and sharing settings (103 I18, 104 I14). */
export const AUTHBASE_URL: string | undefined = import.meta.env.VITE_AUTHBASE_URL || undefined;

/**
 * Authbase consent manager, where the owner changes what they share. Through
 * Authbase's Amped.Bio SSO entry, which signs the owner in first when needed
 * and then lands on returnTo (a bare /profile/... link sends a signed out
 * owner to the Authbase home). Built from the origin, since VITE_AUTHBASE_URL
 * may already carry an SSO path and query.
 */
export const AUTHBASE_CONSENT_URL: string | undefined = (() => {
  if (!AUTHBASE_URL) return undefined;
  try {
    const url = new URL("/sso/amped", AUTHBASE_URL);
    url.searchParams.set("returnTo", "/profile/consent-manager");
    return url.toString();
  } catch {
    return undefined;
  }
})();
