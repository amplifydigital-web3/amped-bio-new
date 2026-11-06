/**
 * Job grants for the container's R2 access (spec 3.5). The Worker gives the
 * container a grant per job: `{publicId}.{exp}.{hmac}`. The outbound handler on
 * r2.internal accepts a request only with a valid, unexpired grant, and only for
 * that item's keys:
 *   GET  incoming/{publicId}/...
 *   PUT  originals/{publicId}/..., audio/{publicId}/..., derived/{publicId}/...
 * The key is derived from CONTENT_PROCESSOR_SECRET with its own label, so a grant
 * can never pass as an API signature.
 */
import { CONTENT_PUBLIC_ID_REGEX } from "@repo/constants/src/contentKeys";
import { equalHex, hmacHex } from "./crypto";

export const GRANT_HEADER = "x-amped-grant";
/** Longer than the slowest step (a long audio file) plus the container's queue wait */
export const GRANT_TTL_SECONDS = 60 * 60;

const message = (publicId: string, exp: number) => `r2-grant.v1.${publicId}.${exp}`;

export async function signGrant(
  publicId: string,
  secret: string,
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  const exp = now + GRANT_TTL_SECONDS;
  return `${publicId}.${exp}.${await hmacHex(secret, message(publicId, exp))}`;
}

/** Returns the public id the grant covers, or null. */
export async function verifyGrant(
  grant: string | null,
  secret: string,
  now = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  if (!grant || !secret) return null;
  const [publicId, expText, signature, extra] = grant.split(".");
  if (extra !== undefined || !publicId || !expText || !signature) return null;
  if (!CONTENT_PUBLIC_ID_REGEX.test(publicId) || !/^\d{1,12}$/.test(expText)) return null;
  const exp = Number(expText);
  if (exp < now) return null;
  const expected = await hmacHex(secret, message(publicId, exp));
  return equalHex(expected, signature) ? publicId : null;
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const READ_PREFIXES = new Set(["incoming"]);
const WRITE_PREFIXES = new Set(["originals", "audio", "derived"]);

/** True when a container may `method` this key under a grant for `publicId`. */
export function keyAllowed(method: string, key: string, publicId: string): boolean {
  const parts = key.split("/");
  if (parts.length < 3 || parts[1] !== publicId) return false;
  if (!parts.slice(2).every(part => SEGMENT.test(part) && part !== "." && part !== "..")) {
    return false;
  }
  const prefix = parts[0] ?? "";
  if (method === "GET") return READ_PREFIXES.has(prefix);
  if (method === "PUT") return WRITE_PREFIXES.has(prefix);
  return false;
}
