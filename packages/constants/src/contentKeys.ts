/**
 * Content public ids and R2 key prefixes (spec 3.3 and 3.4). Kept free of zod and
 * other imports so the media gateway Worker can import this file directly and stay
 * small. content.ts re-exports everything here.
 */

/** 16 lowercase letters and digits: about 82 bits, URL and key safe. */
export const CONTENT_PUBLIC_ID_LENGTH = 16;
export const CONTENT_PUBLIC_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const CONTENT_PUBLIC_ID_REGEX = /^[a-z0-9]{16}$/;

/** R2 key prefixes (spec 3.4). Keys never contain the numeric user id or an email. */
export const CONTENT_R2_PREFIXES = {
  incoming: "incoming",
  originals: "originals",
  audio: "audio",
  derived: "derived",
  quarantine: "quarantine",
} as const;
