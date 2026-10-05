import { z } from "zod";
import { env } from "../env";

// ── Upstream payload schemas ───────────────────────────────────
// The public status endpoint is untrusted input, so the whole response is
// validated with zod (project convention) before we derive anything off it — a
// missing or mistyped field is rejected here rather than cast away and surfaced
// later as a response that lies about its declared contract.

const tierSchema = z.enum(["STANDARD", "ENHANCED"]);

const verificationSchema = z.object({
  type: tierSchema,
  verified_at: z.string(),
  valid_until: z.string(),
});

const badgeSchema = z.object({
  tier: tierSchema,
  // uint256 string — never coerce with Number()
  token_id: z.string(),
  transaction_hash: z.string(),
  minted_at: z.string(),
});

// Consent-filtered PII: only attributes the user actively shared with this
// platform that also have a stored value. Un-granted/empty keys are absent
// (never null), so "denied" and "empty" are indistinguishable — an absent map
// means "nothing shared" and defaults to {}, while present values are still
// validated as strings. Governed purely by consent, independent of status.
const attributesSchema = z.record(z.string(), z.string()).default({});

// Fields shared by every variant; spread into each member of the union below.
const baseShape = {
  wallet_address: z.string(),
  message: z.string(),
  attributes: attributesSchema,
} as const;

const walletStatusSchema = z.discriminatedUnion("status", [
  z.object({
    ...baseShape,
    status: z.literal("NOT_LINKED"),
    authbase_wallet_address: z.null(),
    verification: z.null(),
    badge: z.null(),
  }),
  z.object({
    ...baseShape,
    status: z.literal("NOT_VERIFIED"),
    authbase_wallet_address: z.string(),
    verification: z.null(),
    badge: z.null(),
  }),
  z.object({
    ...baseShape,
    status: z.literal("VERIFIED"),
    authbase_wallet_address: z.string(),
    verification: verificationSchema,
    badge: z.null(),
  }),
  z.object({
    ...baseShape,
    status: z.literal("VERIFIED_WITH_BADGE"),
    authbase_wallet_address: z.string(),
    verification: verificationSchema,
    badge: badgeSchema,
  }),
]);

export type AuthbaseTier = z.infer<typeof tierSchema>;
export type AuthbaseVerification = z.infer<typeof verificationSchema>;
export type AuthbaseBadge = z.infer<typeof badgeSchema>;
export type AuthbaseWalletStatus = z.infer<typeof walletStatusSchema>;

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

/**
 * Parse and fully validate an upstream 200 body before we trust it. The payload
 * is untrusted input, so it is checked against {@link walletStatusSchema} rather
 * than shape-sniffed — a missing or mistyped field (e.g. status "VERIFIED" with
 * a null/partial verification, or a non-string badge token) is rejected here
 * instead of being cast away and crashing the verified/badge derivation later.
 */
function parseWalletStatus(bodyText: string): AuthbaseWalletStatus {
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    throw new AuthbaseError("Authbase returned malformed JSON", 502, false);
  }

  const parsed = walletStatusSchema.safeParse(raw);
  if (!parsed.success) {
    // Log the validation detail server-side for debugging; keep it off the
    // client, which only ever sees the generic "unavailable" mapping.
    console.error("[authbase] payload failed schema validation", parsed.error.flatten());
    throw new AuthbaseError("Authbase returned an unexpected payload shape", 502, false);
  }
  return parsed.data;
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
