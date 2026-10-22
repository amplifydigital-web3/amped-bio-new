/**
 * Media gateway token format (Build Board #20, spec 3.6). Shared by the API, which
 * signs, and the media gateway Worker (PR 3), which verifies. This file holds the
 * format only. The HMAC runs in each runtime: node:crypto on the API, WebCrypto in
 * the Worker. Both sign the same bytes, so tokens are interchangeable.
 *
 * Token: `v1.{kid}.{payload}.{sig}`
 *   payload  base64url(JSON MediaTokenPayload)
 *   sig      base64url(HMAC-SHA256(key[kid], "v1.{kid}.{payload}"))
 *
 * URL: `{MEDIA_GATEWAY_ORIGIN}/{r2Key}?t={token}`. The gateway confirms the path
 * equals payload.k, so a token for one object never opens another.
 *
 * Imports nothing outside this package and nothing with side effects: the media
 * gateway Worker imports this file by path to keep its bundle small.
 */

import { CONTENT_R2_PREFIXES } from "./contentKeys";

export const MEDIA_TOKEN_VERSION = "v1";

/**
 * Longest lifetime a token may carry: a 24 hour public token whose expiry is
 * rounded up to the hour (spec 3.6). The API refuses to sign past it and the
 * gateway refuses to honor past it, so a signing bug cannot mint a lasting URL.
 * It is also the wait before an old key leaves MEDIA_TOKEN_KEYS after a rotation.
 */
export const MEDIA_TOKEN_MAX_LIFETIME_SECONDS = 25 * 60 * 60;

/**
 * R2 prefixes the gateway serves (spec 3.4). `incoming/` is unscanned and
 * `quarantine/` holds malware positives, so neither is ever served.
 */
export const MEDIA_GATEWAY_SERVED_PREFIXES = [
  CONTENT_R2_PREFIXES.originals,
  CONTENT_R2_PREFIXES.audio,
  CONTENT_R2_PREFIXES.derived,
] as const;

/** Single use download ids: base64url, as the API's newDownloadJti makes them. */
export const MEDIA_TOKEN_JTI_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

export interface MediaTokenPayload {
  /** R2 object key */
  k: string;
  /** Asset role, for logs and per role headers */
  r: string;
  /** Expiry, unix seconds */
  exp: number;
  /** 1 when the gateway answers with Content-Disposition: attachment */
  dl: 0 | 1;
  /** Download file name */
  fn?: string;
  /** Single use id for downloads; the gateway's Durable Object refuses a second use */
  j?: string;
}

export interface MediaTokenKey {
  kid: string;
  /** Raw secret bytes */
  secret: Uint8Array;
}

const KID_REGEX = /^[a-z0-9]{1,16}$/;
/** Secrets shorter than this are refused: HMAC-SHA256 wants 32 bytes of key. */
export const MEDIA_TOKEN_MIN_SECRET_BYTES = 32;

// Pure base64url and UTF-8 helpers. This package has no DOM or Node globals, and
// the same code must run on the API, in the browser and in a Worker.
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64URL_INDEX: Record<string, number> = Object.fromEntries(
  [...B64URL].map((char, index) => [char, index])
);

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64URL[(triple >> 18) & 63]! + B64URL[(triple >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64URL[(triple >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64URL[triple & 63]!;
  }
  return out;
}

export function base64UrlDecodeBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const chunk = value.slice(i, i + 4);
    const n = [...chunk].map(char => B64URL_INDEX[char]!);
    const triple = (n[0]! << 18) | (n[1]! << 12) | ((n[2] ?? 0) << 6) | (n[3] ?? 0);
    out.push((triple >> 16) & 255);
    if (chunk.length > 2) out.push((triple >> 8) & 255);
    if (chunk.length > 3) out.push(triple & 255);
  }
  return Uint8Array.from(out);
}

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63)
      );
  }
  return Uint8Array.from(out);
}

/** Strict decoder: returns null on any malformed sequence. */
export function utf8Decode(bytes: Uint8Array): string | null {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const a = bytes[i]!;
    let code: number;
    let extra: number;
    if (a < 0x80) [code, extra] = [a, 0];
    else if (a >= 0xc2 && a < 0xe0) [code, extra] = [a & 31, 1];
    else if (a >= 0xe0 && a < 0xf0) [code, extra] = [a & 15, 2];
    else if (a >= 0xf0 && a < 0xf5) [code, extra] = [a & 7, 3];
    else return null;
    for (let j = 1; j <= extra; j += 1) {
      const next = bytes[i + j];
      if (next === undefined || (next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 63);
    }
    if ((extra === 2 && code < 0x800) || (extra === 3 && (code < 0x10000 || code > 0x10ffff)))
      return null;
    if (code >= 0xd800 && code <= 0xdfff) return null;
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}

export function encodeMediaTokenPayload(payload: MediaTokenPayload): string {
  return base64UrlEncodeBytes(utf8Encode(JSON.stringify(payload)));
}

export function decodeMediaTokenPayload(encoded: string): MediaTokenPayload | null {
  const bytes = base64UrlDecodeBytes(encoded);
  const text = bytes ? utf8Decode(bytes) : null;
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<MediaTokenPayload>;
    if (
      typeof value.k !== "string" ||
      typeof value.r !== "string" ||
      typeof value.exp !== "number" ||
      !Number.isInteger(value.exp) ||
      (value.dl !== 0 && value.dl !== 1) ||
      (value.fn !== undefined && typeof value.fn !== "string") ||
      (value.j !== undefined && typeof value.j !== "string")
    ) {
      return null;
    }
    return value as MediaTokenPayload;
  } catch {
    return null;
  }
}

/** The exact string both runtimes feed to HMAC. */
export function mediaTokenSigningInput(kid: string, encodedPayload: string): string {
  return `${MEDIA_TOKEN_VERSION}.${kid}.${encodedPayload}`;
}

export interface ParsedMediaToken {
  kid: string;
  encodedPayload: string;
  signature: string;
}

export function parseMediaToken(token: string): ParsedMediaToken | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== MEDIA_TOKEN_VERSION) return null;
  const [, kid, encodedPayload, signature] = parts as [string, string, string, string];
  if (!KID_REGEX.test(kid) || !encodedPayload || !signature) return null;
  return { kid, encodedPayload, signature };
}

/**
 * MEDIA_TOKEN_KEYS: `kid:base64urlSecret,kid:base64urlSecret`. The first key signs;
 * every listed key verifies, so a rotation adds the new key first and removes the
 * old one after MEDIA_TOKEN_MAX_LIFETIME_SECONDS (25 hours). Throws on a malformed
 * value instead of signing with a weak or ambiguous key.
 */
export function parseMediaTokenKeys(value: string): MediaTokenKey[] {
  const keys: MediaTokenKey[] = [];
  for (const entry of value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf(":");
    const kid = entry.slice(0, separator);
    const secret = base64UrlDecodeBytes(entry.slice(separator + 1));
    if (separator <= 0 || !KID_REGEX.test(kid)) {
      throw new Error("MEDIA_TOKEN_KEYS: each entry is kid:secret with a kid of a to z and 0 to 9");
    }
    if (!secret || secret.length < MEDIA_TOKEN_MIN_SECRET_BYTES) {
      throw new Error(`MEDIA_TOKEN_KEYS: the secret for ${kid} must be at least 32 bytes`);
    }
    if (keys.some(key => key.kid === kid)) {
      throw new Error(`MEDIA_TOKEN_KEYS: duplicate kid ${kid}`);
    }
    keys.push({ kid, secret });
  }
  return keys;
}
