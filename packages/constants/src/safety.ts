/**
 * Adult content review and Safety (Build Board #28, docs/features/adult-content-review.md,
 * PR R1). Shared by the API and the admin app. Nothing here is fan facing.
 */

/** The Adult Content Policy version a creator accepts (section 5.1, COUNSEL-ADULT 1.1). */
export const ADULT_POLICY_VERSION = "1.1";

/** The performer release version (section 5.2, docs/legal/performer-release.md). */
export const RELEASE_VERSION = "1";

/** Safety roles in the comma separated User.role (section 8.8). `admin` does not get Safety. */
export const SAFETY_ROLES = ["moderator", "safety_lead"] as const;
export type SafetyRole = (typeof SAFETY_ROLES)[number];

export const SAFETY_CASE_TYPES = [
  "CHILD_SAFETY",
  "TAKE_IT_DOWN",
  "AGE_RESULT",
  "ADULT_REVIEW",
  "CLASSIFIER_HOLD",
  "STORE_POLICY",
  "COPYRIGHT",
  "REPORT",
  "APPEAL",
  "ADULT_SETUP",
] as const;
export type SafetyCaseType = (typeof SAFETY_CASE_TYPES)[number];

/** Queue labels (section 8.1). */
export const SAFETY_CASE_LABELS: Record<SafetyCaseType, string> = {
  CHILD_SAFETY: "Child safety",
  TAKE_IT_DOWN: "Take It Down",
  AGE_RESULT: "Age result",
  ADULT_REVIEW: "18+ review",
  CLASSIFIER_HOLD: "Classifier hold",
  STORE_POLICY: "Store policy",
  COPYRIGHT: "Copyright",
  REPORT: "Report",
  APPEAL: "Appeal",
  ADULT_SETUP: "18+ setup check",
};

/** 0 critical, 1 high, 2 normal. */
export const SAFETY_SEVERITY_LABELS = ["Critical", "High", "Normal"] as const;

/** How long a case may stay open, and how it counts (section 8.1). */
export type SafetyDue = { hours: number } | { businessDays: number };

export const SAFETY_CASE_DEFAULTS: Record<SafetyCaseType, { severity: 0 | 1 | 2; due: SafetyDue }> =
  {
    CHILD_SAFETY: { severity: 0, due: { hours: 1 } },
    // 48 hours is the legal limit; 24 hours is the target the queue sorts by
    TAKE_IT_DOWN: { severity: 1, due: { hours: 24 } },
    AGE_RESULT: { severity: 1, due: { businessDays: 1 } },
    ADULT_REVIEW: { severity: 2, due: { businessDays: 1 } },
    CLASSIFIER_HOLD: { severity: 2, due: { businessDays: 1 } },
    STORE_POLICY: { severity: 2, due: { businessDays: 3 } },
    COPYRIGHT: { severity: 1, due: { businessDays: 1 } },
    REPORT: { severity: 2, due: { businessDays: 3 } },
    APPEAL: { severity: 2, due: { businessDays: 5 } },
    ADULT_SETUP: { severity: 2, due: { businessDays: 1 } },
  };

/** Take It Down legal limit from receipt (section 7.3). */
export const TAKE_IT_DOWN_LEGAL_HOURS = 48;

/** Case and request numbers: SC-2026-000123, TD-2026-000123, CN-2026-000123. */
export const SAFETY_NUMBER_PREFIX = {
  case: "SC",
  takedown: "TD",
  copyright: "CN",
  counter: "CC",
} as const;

export function safetyNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

/** Hash blocklist reasons (section 10). `dmca` stays on old rows; new copyright rows use `copyright`. */
export const BLOCKED_HASH_REASONS = [
  "copyright",
  "dmca",
  "malware",
  "policy",
  "ncii",
  "csam",
  "non_consent",
] as const;
export type BlockedHashReason = (typeof BLOCKED_HASH_REASONS)[number];

/** Child safety hashes can never be unblocked from the Safety tool (section 8.7). */
export const UNBLOCKABLE_HASH_REASONS: readonly BlockedHashReason[] = ["csam"];

/** "Block this file everywhere" is on by default for these removal reasons (section 8.2). */
export const BLOCK_FILE_DEFAULT_REASONS = ["copyright", "malware", "non_consent", "csam"] as const;

/**
 * Settings (section 8.7) and their defaults. Stored as one JSON row in site_settings
 * (`safety.settings`); a missing key falls back to these values.
 */
export interface SafetySettings {
  /** Hamming distance at or under which two perceptual hashes are the same file */
  phashThreshold: number;
  /** Classifier score at or over which an item is explicit */
  classifierThreshold: number;
  /** Break prompt after this many minutes of case view time (8.9) */
  breakAfterMinutes: number;
  /** Daily cap on 18+ and child safety case time per reviewer, in minutes (8.9) */
  dailyCapMinutes: number;
  /** A claimed case is released after this long with no activity (8.1) */
  claimIdleMinutes: number;
  /** Strikes in 12 months that suspend uploads (decision D6) */
  strikesToSuspend: number;
  /** On call for child safety alerts: email and phone, staff data, safety leads only (8.5) */
  onCall: Array<{ name: string; email?: string; phone?: string }>;
}

export const SAFETY_SETTINGS_DEFAULTS: SafetySettings = {
  phashThreshold: 10,
  classifierThreshold: 0.85,
  breakAfterMinutes: 50,
  dailyCapMinutes: 240,
  claimIdleMinutes: 30,
  strikesToSuspend: 3,
  onCall: [],
};

/** site_settings key for the Safety settings JSON. */
export const SAFETY_SETTINGS_KEY = "safety.settings";
