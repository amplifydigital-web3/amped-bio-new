import { labelhash } from "viem";

/**
 * Revolution Name Service (RNS) helpers that do not depend on a chain.
 * Chain aware helpers (getRnsSuffix, formatRnsName, rnsNode, parseRnsInput)
 * live next to the chain config in index.ts.
 */

/** Suffixes a person may type or paste. The chain suffix is always tried first. */
export const RNS_KNOWN_SUFFIXES = [".revotest.eth", ".revo", ".eth"] as const;

/** Grace period after expiry, in seconds. Mirrors GRACE_PERIOD in the RNS L2 contracts. */
export const RNS_GRACE_PERIOD_SECONDS = 86_400;

/** Days before expiry when a name counts as expiring soon (101 I10). */
export const RNS_EXPIRING_SOON_DAYS = 30;

/** The RNS name rule: 6 to 32 characters, letters, numbers and hyphens. */
export const RNS_LABEL_RULE = {
  minLength: 6,
  maxLength: 32,
  pattern: /^[a-z0-9-]+$/,
} as const;

/** Lowercases, trims, drops a leading @ and strips the first matching suffix. */
export function stripRnsSuffix(input: string, suffixes: readonly string[]): string {
  let value = input.trim().toLowerCase();
  if (value.startsWith("@")) value = value.slice(1);
  const ordered = [...new Set(suffixes.map(s => s.toLowerCase()))].sort(
    (a, b) => b.length - a.length
  );
  for (const suffix of ordered) {
    if (suffix && value.endsWith(suffix) && value.length > suffix.length) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

export type RnsLabelProblem = "empty" | "length" | "characters";

/** Checks a bare label against the name rule. Returns null when it passes. */
export function checkRnsLabel(label: string): RnsLabelProblem | null {
  if (!label) return "empty";
  if (!RNS_LABEL_RULE.pattern.test(label)) return "characters";
  if (label.length < RNS_LABEL_RULE.minLength || label.length > RNS_LABEL_RULE.maxLength) {
    return "length";
  }
  return null;
}

/** The fix for a label problem, in words (101 I04). */
export const RNS_LABEL_FIX: Record<RnsLabelProblem, string> = {
  empty: "Type an RNS name.",
  length: "Use 6 to 32 characters.",
  characters: "Use letters, numbers and hyphens only.",
};

/** Words the person sees when the server refuses an RNS name (100 I02). */
export const RNS_BINDING_MESSAGES = {
  no_wallet: "Connect a wallet to show an RNS name.",
  not_linked: "This RNS name is not linked to your wallet.",
  unavailable: "We could not check this RNS name. Try again in a moment.",
} as const;

/** The BaseRegistrar token id of a label. */
export const rnsTokenId = (label: string): bigint => BigInt(labelhash(label));

/**
 * Registration expiry from the subgraph field expiryDateWithGrace.
 * Every active, expiring or expired decision uses this value, not the grace end (100 I04).
 */
export const rnsExpiryFromGraceEnd = (expiryDateWithGrace: string | number | bigint): number =>
  Math.max(0, Number(expiryDateWithGrace) - RNS_GRACE_PERIOD_SECONDS);

export type RnsExpiryState = "active" | "expiring" | "grace" | "lapsed";

/**
 * The state of a name from its registration expiry (seconds).
 * active: more than 30 days left. expiring: 30 days or less. grace: past
 * expiry, inside the grace period. lapsed: past the grace end, anyone can register it.
 */
export function rnsExpiryState(
  expirySeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): RnsExpiryState {
  if (expirySeconds > nowSeconds) {
    return expirySeconds - nowSeconds <= RNS_EXPIRING_SOON_DAYS * 86_400 ? "expiring" : "active";
  }
  return nowSeconds < expirySeconds + RNS_GRACE_PERIOD_SECONDS ? "grace" : "lapsed";
}

/** True while the registration has not expired. The grace period does not count. */
export const isRnsNameActive = (expirySeconds: number, nowSeconds?: number): boolean => {
  const state = rnsExpiryState(expirySeconds, nowSeconds);
  return state === "active" || state === "expiring";
};
