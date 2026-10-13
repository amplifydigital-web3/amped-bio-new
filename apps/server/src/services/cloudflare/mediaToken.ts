/**
 * Media gateway tokens, signing side (Build Board #20, spec 3.6). The format lives in
 * @repo/constants (mediaToken.ts) so the gateway Worker (PR 3) verifies the same bytes
 * with WebCrypto. Nothing in PR 2 hands these out yet: content.getReadUrl arrives in
 * PR 6. They exist now so PR 3 can test the gateway against tokens the API signs.
 *
 * Also here: the processor callback signature (spec 3.5 step 4), the same HMAC idea
 * with CONTENT_PROCESSOR_SECRET.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CONTENT_CALLBACK_WINDOW_SECONDS,
  base64UrlEncodeBytes,
  decodeMediaTokenPayload,
  encodeMediaTokenPayload,
  mediaTokenSigningInput,
  parseMediaToken,
  parseMediaTokenKeys,
  type MediaTokenKey,
  type MediaTokenPayload,
} from "@repo/constants";
import { env } from "../../env";

let cachedKeys: { source: string; keys: MediaTokenKey[] } | null = null;

/** Keys from MEDIA_TOKEN_KEYS, parsed once. Throws when the value is malformed. */
export function mediaTokenKeys(source = env.MEDIA_TOKEN_KEYS): MediaTokenKey[] {
  if (cachedKeys?.source !== source) cachedKeys = { source, keys: parseMediaTokenKeys(source) };
  return cachedKeys.keys;
}

function hmac(secret: Uint8Array, input: string): string {
  return base64UrlEncodeBytes(createHmac("sha256", secret).update(input).digest());
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Signs with the first key. */
export function signMediaToken(payload: MediaTokenPayload, keys = mediaTokenKeys()): string {
  const signer = keys[0];
  if (!signer) throw new Error("MEDIA_TOKEN_KEYS is empty");
  const encoded = encodeMediaTokenPayload(payload);
  const input = mediaTokenSigningInput(signer.kid, encoded);
  return `${input}.${hmac(signer.secret, input)}`;
}

/**
 * Reference verifier, the same steps the gateway runs: known kid, valid signature,
 * not expired. The API uses it in tests; the gateway reimplements it with WebCrypto.
 */
export function verifyMediaToken(
  token: string,
  keys = mediaTokenKeys(),
  now: Date = new Date()
): MediaTokenPayload | null {
  const parsed = parseMediaToken(token);
  if (!parsed) return null;
  const key = keys.find(candidate => candidate.kid === parsed.kid);
  if (!key) return null;
  const expected = hmac(key.secret, mediaTokenSigningInput(parsed.kid, parsed.encodedPayload));
  if (!sameString(expected, parsed.signature)) return null;
  const payload = decodeMediaTokenPayload(parsed.encodedPayload);
  if (!payload || payload.exp <= Math.floor(now.getTime() / 1000)) return null;
  return payload;
}

/** Gateway URL for an R2 key: `{origin}/{key}?t={token}`. */
export function mediaUrl(r2Key: string, token: string, origin = env.MEDIA_GATEWAY_ORIGIN): string {
  if (!origin) throw new Error("MEDIA_GATEWAY_ORIGIN is not set");
  const path = r2Key.split("/").map(encodeURIComponent).join("/");
  return `${origin.replace(/\/+$/, "")}/${path}?t=${encodeURIComponent(token)}`;
}

/** Single use id for download tokens (the gateway's Durable Object keys on it). */
export function newDownloadJti(): string {
  return base64UrlEncodeBytes(randomBytes(16));
}

// ----------------------------------------------------------------------------
// Processor callback signature: `t={unix},v1={hex hmac of "t.rawBody"}`
// ----------------------------------------------------------------------------

export function signProcessorCallback(
  rawBody: string,
  secret = env.CONTENT_PROCESSOR_SECRET,
  now: Date = new Date()
): string {
  const t = Math.floor(now.getTime() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export function verifyProcessorCallback(
  rawBody: Buffer | string,
  header: string | undefined,
  secret = env.CONTENT_PROCESSOR_SECRET,
  now: Date = new Date()
): boolean {
  if (!header || !secret) return false;
  const fields = Object.fromEntries(
    header.split(",").map(part => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    })
  );
  const t = Number(fields.t);
  const given = fields.v1;
  if (!Number.isInteger(t) || typeof given !== "string" || !/^[a-f0-9]{64}$/.test(given)) {
    return false;
  }
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > CONTENT_CALLBACK_WINDOW_SECONDS)
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${fields.t}.`)
    .update(rawBody)
    .digest("hex");
  return sameString(expected, given);
}
