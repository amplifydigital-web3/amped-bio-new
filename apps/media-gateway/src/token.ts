/**
 * Media token verification, the gateway side of spec 3.6. The format and the key
 * list parser live in @repo/constants (mediaToken.ts), shared with the API signer.
 * The HMAC runs here with WebCrypto. The API signs the same bytes with node:crypto,
 * and test/fixtures/token-vectors.json proves the two agree.
 */
import {
  MEDIA_TOKEN_JTI_REGEX,
  MEDIA_TOKEN_MAX_LIFETIME_SECONDS,
  base64UrlDecodeBytes,
  base64UrlEncodeBytes,
  decodeMediaTokenPayload,
  mediaTokenSigningInput,
  parseMediaToken,
  parseMediaTokenKeys,
  utf8Encode,
  type MediaTokenPayload,
} from "@repo/constants/src/mediaToken";

/** Why a token was refused. Logged, never sent to the viewer. */
export type TokenRefusal = "malformed" | "unknown_kid" | "bad_signature" | "expired" | "too_long";

export type TokenCheck =
  | { ok: true; payload: MediaTokenPayload }
  | { ok: false; reason: TokenRefusal };

let cached: { source: string; keys: Map<string, CryptoKey> } | null = null;

/**
 * Imports every key in MEDIA_TOKEN_KEYS once per isolate. Throws when the value is
 * missing or malformed, so a misconfigured gateway fails loudly instead of
 * verifying against nothing.
 */
export async function verificationKeys(source: string): Promise<Map<string, CryptoKey>> {
  if (cached?.source === source) return cached.keys;
  const parsed = parseMediaTokenKeys(source ?? "");
  if (parsed.length === 0) throw new Error("MEDIA_TOKEN_KEYS is empty");
  const keys = new Map<string, CryptoKey>();
  for (const { kid, secret } of parsed) {
    keys.set(
      kid,
      await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, [
        "verify",
      ])
    );
  }
  cached = { source, keys };
  return keys;
}

/**
 * Verifies a token: known kid, valid signature, not expired, and a lifetime no
 * longer than the API may sign. `now` is unix seconds.
 */
export async function verifyToken(
  token: string,
  keys: Map<string, CryptoKey>,
  now: number
): Promise<TokenCheck> {
  const parsed = parseMediaToken(token);
  if (!parsed) return { ok: false, reason: "malformed" };
  const key = keys.get(parsed.kid);
  if (!key) return { ok: false, reason: "unknown_kid" };

  const signature = base64UrlDecodeBytes(parsed.signature);
  // Only the canonical encoding verifies, so a token has exactly one spelling
  if (!signature || base64UrlEncodeBytes(signature) !== parsed.signature) {
    return { ok: false, reason: "malformed" };
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    utf8Encode(mediaTokenSigningInput(parsed.kid, parsed.encodedPayload))
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  const payload = decodeMediaTokenPayload(parsed.encodedPayload);
  if (!payload) return { ok: false, reason: "malformed" };
  if (payload.exp <= now) return { ok: false, reason: "expired" };
  if (payload.exp - now > MEDIA_TOKEN_MAX_LIFETIME_SECONDS)
    return { ok: false, reason: "too_long" };
  if (payload.j !== undefined && !MEDIA_TOKEN_JTI_REGEX.test(payload.j)) {
    return { ok: false, reason: "malformed" };
  }
  // A download must be single use (spec 3.6), so it must carry a jti
  if (payload.dl === 1 && payload.j === undefined) return { ok: false, reason: "malformed" };
  return { ok: true, payload };
}
