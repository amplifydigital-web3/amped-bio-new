import { randomBytes } from "node:crypto";

/**
 * Theme Engine v2 TE-4b (spec 3.9, decision 8): share links for looks.
 *
 * A link is amped.bio/t/<slug>: 8 characters of RFC 4648 base32 over 40
 * random bits, never derived from the look's name, so a link can't be guessed
 * from a creator's look names. Revoking clears the slug and the page 404s.
 * Links carry ids and clamped params only (decision 9); a shared look never
 * carries the author's uploaded files into another creator's page.
 */

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

export const SHARE_SLUG_PATTERN = /^[a-z2-7]{8}$/;

/** Share and unshare per creator, per hour (spec 3.9). */
export const SHARE_RATE = { limit: 10, windowSeconds: 3600 };
/** theme.bySlug per IP, per minute (spec 3.11). */
export const BY_SLUG_RATE = { limit: 60, windowSeconds: 60 };

/** 8 base32 characters from 40 random bits. */
export function newShareSlug(bytes: Uint8Array = randomBytes(5)): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes.slice(0, 5)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export function sharePath(slug: string): string {
  return `/t/${slug}`;
}

type Loose = Record<string, any>;

/** True when the config's background is a file someone uploaded. */
export function hasUploadedBackground(config: unknown): boolean {
  const c = (config ?? {}) as Loose;
  return Boolean(c["background"]?.fileId || c["scene"]?.base?.fileId);
}

/**
 * A shared config made safe to apply to another creator's look (spec 3.9:
 * import never carries files). An uploaded background (v1 background.fileId,
 * v2 scene.base.fileId) is replaced by the target look's own background, or
 * dropped when the target has none. Returns the config and whether the
 * background was replaced, so the page can say so.
 */
export function configForApply(
  shared: unknown,
  target: unknown
): { config: Loose; backgroundKept: boolean } {
  const config = JSON.parse(JSON.stringify(shared ?? {})) as Loose;
  const own = (target ?? {}) as Loose;
  if (!hasUploadedBackground(config)) return { config, backgroundKept: false };
  if (config["scene"]?.base?.fileId) {
    if (own["scene"]?.base) config["scene"].base = own["scene"].base;
    else config["scene"].base = { type: "color", value: "#ffffff" };
  }
  if (config["background"]?.fileId) {
    if (own["background"]) config["background"] = own["background"];
    else delete config["background"];
  }
  return { config, backgroundKept: true };
}
