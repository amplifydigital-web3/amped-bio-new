// Theme Engine v2 fonts, phase 2b PR 2: the storage keys of mirrored fonts on
// the media bucket. Kept free of other imports so the media gateway Worker can
// read them without the effect registry.

/** Storage prefix on the media bucket. The media gateway serves it without a token. */
export const FONT_STORAGE_PREFIX = "fonts";

/** Stylesheet keys: fonts/<slug>/<hash>.css. File keys: fonts/files/<sha256>.woff2. */
export const FONT_CSS_KEY_PATTERN = /^fonts\/[a-z0-9-]{1,60}\/[a-z0-9]{6,16}\.css$/;
export const FONT_FILE_KEY_PATTERN = /^fonts\/files\/[a-f0-9]{64}\.woff2$/;

/** True for a key the gateway may serve as a public font. */
export function isFontKey(key: string): boolean {
  return FONT_CSS_KEY_PATTERN.test(key) || FONT_FILE_KEY_PATTERN.test(key);
}
