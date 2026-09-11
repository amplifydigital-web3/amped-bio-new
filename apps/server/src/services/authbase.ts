import { env } from "../env";

export type AuthbaseTier = "STANDARD" | "ENHANCED";

export interface AuthbaseVerification {
  type: AuthbaseTier;
  verified_at: string;
  valid_until: string;
}

export interface AuthbaseBadge {
  tier: AuthbaseTier;
  // uint256 string — never coerce with Number()
  token_id: string;
  transaction_hash: string;
  minted_at: string;
}

interface AuthbaseStatusBase {
  wallet_address: string;
  message: string;
  // Consent-filtered PII: only attributes the user actively shared with this
  // platform that also have a stored value. Un-granted/empty keys are absent
  // (never null), so "denied" and "empty" are indistinguishable. {} when
  // nothing shared. Governed purely by consent, independent of status.
  attributes: Record<string, string>;
}

export type AuthbaseNotLinked = AuthbaseStatusBase & {
  status: "NOT_LINKED";
  authbase_wallet_address: null;
  verification: null;
  badge: null;
};

export type AuthbaseNotVerified = AuthbaseStatusBase & {
  status: "NOT_VERIFIED";
  authbase_wallet_address: string;
  verification: null;
  badge: null;
};

export type AuthbaseVerified = AuthbaseStatusBase & {
  status: "VERIFIED";
  authbase_wallet_address: string;
  verification: AuthbaseVerification;
  badge: null;
};

export type AuthbaseVerifiedWithBadge = AuthbaseStatusBase & {
  status: "VERIFIED_WITH_BADGE";
  authbase_wallet_address: string;
  verification: AuthbaseVerification;
  badge: AuthbaseBadge;
};

export type AuthbaseWalletStatus =
  | AuthbaseNotLinked
  | AuthbaseNotVerified
  | AuthbaseVerified
  | AuthbaseVerifiedWithBadge;

export type AuthbaseWalletStatusResponse = AuthbaseWalletStatus & {
  verified: boolean;
  hasBadge: boolean;
};

/**
 * A failure talking to (or interpreting) the upstream Authbase API. `httpStatus`
 * is the upstream status when the failure came from a response; `retryable`
 * flags transient causes (network, 429, 5xx) worth surfacing as "try again".
 */
export class AuthbaseError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "AuthbaseError";
  }
}

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Whether the Authbase integration has all three required env vars. The client
 * reads this (via the isConfigured procedure) to hide the Identity tab entirely
 * rather than surfacing an "Unavailable" error when the feature is simply off.
 */
export function isAuthbaseConfigured(): boolean {
  return Boolean(env.AUTHBASE_BASE_URL && env.AUTHBASE_API_KEY && env.AUTHBASE_API_SECRET);
}

function assertConfigured(): void {
  if (!isAuthbaseConfigured()) {
    console.error(
      "[authbase] Integration is not configured. " +
        "Missing AUTHBASE_BASE_URL, AUTHBASE_API_KEY, or AUTHBASE_API_SECRET."
    );
    throw new AuthbaseError(
      "Authbase integration not configured (AUTHBASE_BASE_URL / AUTHBASE_API_KEY / AUTHBASE_API_SECRET)",
      401,
      false
    );
  }
}

function buildAuthHeader(): string {
  const token = Buffer.from(`${env.AUTHBASE_API_KEY}:${env.AUTHBASE_API_SECRET}`, "utf8").toString(
    "base64"
  );
  return `Basic ${token}`;
}

function isVerificationShape(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).valid_until === "string"
  );
}

/**
 * Parse and shape-check an upstream 200 body before we trust it. Without this,
 * a malformed payload (e.g. status "VERIFIED" with verification: null) would
 * later crash the verified/badge derivation with a TypeError.
 */
function parseWalletStatus(bodyText: string): AuthbaseWalletStatus {
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    throw new AuthbaseError("Authbase returned malformed JSON", 502, false);
  }

  const o = raw as Record<string, unknown>;
  const valid =
    typeof o === "object" &&
    o !== null &&
    typeof o.wallet_address === "string" &&
    (o.status === "NOT_LINKED" ||
      o.status === "NOT_VERIFIED" ||
      (o.status === "VERIFIED" && isVerificationShape(o.verification)) ||
      (o.status === "VERIFIED_WITH_BADGE" &&
        isVerificationShape(o.verification) &&
        typeof o.badge === "object" &&
        o.badge !== null));

  if (!valid) {
    throw new AuthbaseError("Authbase returned an unexpected payload shape", 502, false);
  }
  return raw as AuthbaseWalletStatus;
}

async function fetchWalletStatus(address: string): Promise<AuthbaseWalletStatus> {
  assertConfigured();

  // Callers validate the address at the boundary (viem isAddress).
  const normalized = address.toLowerCase();
  const url = `${env.AUTHBASE_BASE_URL.replace(/\/$/, "")}/api/v1/public/wallets/${normalized}/status`;

  let res: Response;
  let bodyText: string;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: buildAuthHeader(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    bodyText = await res.text();
  } catch (err) {
    // Network / timeout / abort.
    const detail = err instanceof Error ? err.message : String(err);
    throw new AuthbaseError(`Authbase request failed: ${detail}`, undefined, true);
  }

  if (res.status === 200) {
    return parseWalletStatus(bodyText);
  }

  if (res.status === 401) {
    // Configuration error — bad/revoked key. Loud, non-retryable.
    console.error(
      "[authbase] 401 Unauthorized — AUTHBASE_API_KEY is invalid or revoked. Check secret configuration."
    );
    throw new AuthbaseError("Authbase auth failed (401) — check AUTHBASE_API_KEY", 401, false);
  }

  if (res.status === 429) {
    throw new AuthbaseError("Authbase rate limited (429)", 429, true);
  }

  if (res.status >= 500 && res.status <= 599) {
    throw new AuthbaseError(`Authbase upstream ${res.status}`, res.status, true);
  }

  // Other 4xx — non-retryable, bubble up.
  throw new AuthbaseError(
    `Authbase request failed (${res.status}): ${bodyText.slice(0, 200)}`,
    res.status,
    false
  );
}

/**
 * Verified iff the status carries an attestation. We deliberately do NOT
 * re-check `valid_until > now` here: the Authbase backend already enforces
 * `validUntil > now` at the source (it returns NOT_VERIFIED for an expired
 * attestation and never emits a VERIFIED* status with a stale date). Re-deriving
 * that decision against THIS server's clock could only introduce a false
 * negative on clock skew — it can never produce a correct rejection upstream
 * hasn't already made. Trust the source of truth.
 */
function isAuthbaseVerified(result: AuthbaseWalletStatus): boolean {
  return result.status === "VERIFIED" || result.status === "VERIFIED_WITH_BADGE";
}

function hasAuthbaseBadge(result: AuthbaseWalletStatus): boolean {
  return result.status === "VERIFIED_WITH_BADGE";
}

/**
 * Look up a wallet's Authbase identity status and return the enriched payload
 * the client renders off. Throws {@link AuthbaseError} on any upstream failure.
 */
export async function getAuthbaseWalletStatus(
  address: string
): Promise<AuthbaseWalletStatusResponse> {
  const result = await fetchWalletStatus(address);
  return {
    ...result,
    verified: isAuthbaseVerified(result),
    hasBadge: hasAuthbaseBadge(result),
  };
}
