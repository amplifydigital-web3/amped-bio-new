import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../../env";
import { cache } from "../../utils/cache";

/**
 * Messaging on Telegram (Build Board #2), spec 3.4 and decision 3. Log In with
 * Telegram is OpenID Connect with PKCE at oauth.telegram.org. better-auth has no
 * generic OIDC plugin in this repo, so the link flow is written here on `jose`
 * (already a server dependency) and `fetch`:
 *
 * - discovery reads Telegram's openid-configuration once per process,
 * - `start` stores the PKCE verifier and the Amped user against a random state
 *   for 10 minutes; the state is redeemable once,
 * - the callback exchanges the code at the token endpoint with the client
 *   secret and the verifier, then verifies the ID token signature against
 *   Telegram's JWKS with the issuer and our client id as audience.
 *
 * Scopes are openid, profile and telegram:bot_access, never phone (spec 3.3:
 * no phone number column exists anywhere).
 */

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
export const TELEGRAM_SCOPES = "openid profile telegram:bot_access";
export const BOT_ACCESS_SCOPE = "telegram:bot_access";
const STATE_TTL_SECONDS = 600;
const STATE_PREFIX = "tg:oidc:";
const HTTP_TIMEOUT_MS = 10_000;

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

let discoveryPromise: Promise<Discovery> | null = null;
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function isOidcConfigured() {
  return (
    env.TELEGRAM_ENABLED &&
    env.TELEGRAM_OIDC_CLIENT_ID.length > 0 &&
    env.TELEGRAM_OIDC_CLIENT_SECRET.length > 0
  );
}

/** Where Telegram sends the user back: the API host, never the app host (BotFather allowed URL). */
export function telegramRedirectUri(): string {
  const host = env.API_HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}/telegram/oidc/callback`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body) {
    const reason = typeof body?.error === "string" ? body.error : `http_${res.status}`;
    throw new Error(`telegram_oidc_${reason}`);
  }
  return body;
}

export function getDiscovery(): Promise<Discovery> {
  if (!discoveryPromise) {
    discoveryPromise = fetchJson(`${TELEGRAM_ISSUER}/.well-known/openid-configuration`)
      .then(doc => {
        const fields = ["issuer", "authorization_endpoint", "token_endpoint", "jwks_uri"];
        for (const field of fields) {
          if (typeof doc[field] !== "string" || !String(doc[field]).startsWith("https://")) {
            throw new Error(`telegram_oidc_discovery_${field}`);
          }
        }
        if (doc.issuer !== TELEGRAM_ISSUER) throw new Error("telegram_oidc_issuer_mismatch");
        return doc as unknown as Discovery;
      })
      .catch(error => {
        // Do not cache a failed discovery; the next link attempt retries
        discoveryPromise = null;
        throw error;
      });
  }
  return discoveryPromise;
}

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

type PendingLink = { userId: number; verifier: string };

/** Build the authorization URL for one link attempt by `userId`. */
export async function startTelegramLink(userId: number): Promise<string> {
  const discovery = await getDiscovery();
  const { verifier, challenge } = pkcePair();
  const state = base64url(randomBytes(24));
  await cache.set<PendingLink>(`${STATE_PREFIX}${state}`, { userId, verifier }, STATE_TTL_SECONDS);
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: env.TELEGRAM_OIDC_CLIENT_ID,
    redirect_uri: telegramRedirectUri(),
    scope: TELEGRAM_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  return url.toString();
}

/** Read and delete the pending link for `state`. Atomic, so a state is redeemable
 * exactly once even when two callbacks with the same state race. */
export async function takePendingLink(state: string | null): Promise<PendingLink | null> {
  if (!state || state.length > 128) return null;
  return cache.take<PendingLink>(`${STATE_PREFIX}${state}`);
}

export type TelegramClaims = {
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  botAccess: boolean;
};

function stringClaim(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

/**
 * Map verified ID token claims to the fields we store. Telegram puts the user id
 * in `id` and `sub`; either must be a positive integer of at most 52 bits.
 */
export function claimsToIdentity(
  claims: Record<string, unknown>,
  grantedScope: string | undefined
): TelegramClaims {
  const raw = claims.id ?? claims.sub;
  const asString = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw : "";
  if (!/^\d{1,16}$/.test(asString)) throw new Error("telegram_id_missing");
  const telegramUserId = BigInt(asString);
  if (telegramUserId <= 0n || telegramUserId > 2n ** 52n) throw new Error("telegram_id_invalid");

  const scopes = (grantedScope ?? "").split(/\s+/);
  const photo = stringClaim(claims.picture, 1024);
  return {
    telegramUserId,
    username: stringClaim(claims.preferred_username, 64),
    firstName: stringClaim(claims.given_name ?? claims.name, 128),
    photoUrl: photo && photo.startsWith("https://") ? photo : null,
    botAccess: scopes.includes(BOT_ACCESS_SCOPE),
  };
}

/** Verify an ID token: Telegram's signature, our client id as audience, not expired. */
export async function verifyIdToken(idToken: string): Promise<JWTPayload> {
  const discovery = await getDiscovery();
  if (!jwks) jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: TELEGRAM_ISSUER,
    audience: env.TELEGRAM_OIDC_CLIENT_ID,
    clockTolerance: 60,
  });
  return payload;
}

/** Redeem `code` against the pending verifier; return the verified identity. */
export async function finishTelegramLink(
  code: string,
  pending: PendingLink
): Promise<TelegramClaims> {
  const discovery = await getDiscovery();
  const basic = Buffer.from(
    `${encodeURIComponent(env.TELEGRAM_OIDC_CLIENT_ID)}:${encodeURIComponent(env.TELEGRAM_OIDC_CLIENT_SECRET)}`
  ).toString("base64");
  const tokens = await fetchJson(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: telegramRedirectUri(),
      code_verifier: pending.verifier,
    }).toString(),
  });
  if (typeof tokens.id_token !== "string") throw new Error("telegram_id_token_missing");
  const claims = await verifyIdToken(tokens.id_token);
  const scope = typeof tokens.scope === "string" ? tokens.scope : undefined;
  return claimsToIdentity(claims as Record<string, unknown>, scope);
}

/** Test seam. */
export function resetOidcConfigForTests() {
  discoveryPromise = null;
  jwks = null;
}
