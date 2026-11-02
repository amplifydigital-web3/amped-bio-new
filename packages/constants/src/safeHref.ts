import { z } from "zod";

// Build Board D57: a creator's link must never run script on amped.bio.
// One rule for every place a stored URL becomes a link: the block schemas,
// the server on save and on public reads, and every renderer.

/** Schemes a link block may use. Everything else (javascript:, data:, vbscript:, file:) is refused. */
export const SAFE_HREF_SCHEMES = ["http:", "https:", "mailto:", "tel:"] as const;

/** Schemes an embed (media block) may use. */
export const SAFE_WEB_SCHEMES = ["http:", "https:"] as const;

// Browsers ignore whitespace and control characters inside a URL scheme
// ("java\tscript:", "\u0000javascript:"), so they come out before the check.
const IGNORED = /[\s\p{Cc}]+/gu;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** The value as a browser reads its scheme: no whitespace or control characters. */
export function normalizeHref(value: string): string {
  return value.replace(IGNORED, "");
}

function schemeOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = normalizeHref(value).match(SCHEME);
  return match?.[1] ? `${match[1].toLowerCase()}:` : null;
}

/**
 * True when the value is an absolute link with an allowed scheme: http, https,
 * mailto or tel. Relative and protocol relative values are refused, because a
 * creator link always leaves amped.bio.
 */
export function isSafeHref(value: unknown): value is string {
  const scheme = schemeOf(value);
  if (!scheme || !(SAFE_HREF_SCHEMES as readonly string[]).includes(scheme)) return false;
  if (scheme === "http:" || scheme === "https:")
    return /^https?:\/\/[^/?#]/i.test(normalizeHref(value as string));
  return true;
}

/** True for an absolute http or https URL with a host. Embeds and web only links use this. */
export function isSafeWebUrl(value: unknown): value is string {
  const scheme = schemeOf(value);
  return (
    !!scheme &&
    (SAFE_WEB_SCHEMES as readonly string[]).includes(scheme) &&
    /^https?:\/\/[^/?#]/i.test(normalizeHref(value as string))
  );
}

/** The href to render, or undefined when the value is not a safe link. */
export function safeHref(value: unknown): string | undefined {
  return isSafeHref(value) ? value : undefined;
}

/**
 * The href a renderer may put on an anchor: a safe link, or a path on this
 * site ("/i/pools/0x..."). "//host" and "/\host" are refused because
 * browsers read them as another site. Undefined means render no link.
 */
export function safeRenderHref(value: unknown): string | undefined {
  if (isSafeHref(value)) return value;
  if (typeof value === "string" && /^\/(?![/\\])/.test(normalizeHref(value))) return value;
  return undefined;
}

export const UNSAFE_LINK_MESSAGE = "Use a link that starts with https://, mailto: or tel:";
export const UNSAFE_WEB_URL_MESSAGE = "Use a link that starts with https://";

const urlShape = z.string().url();

function storedUrl(isSafe: (value: string) => boolean, message: string) {
  return z.string().superRefine((value, ctx) => {
    if (value === "") return;
    if (!urlShape.safeParse(value).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a valid URL" });
    } else if (!isSafe(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
  });
}

/**
 * A stored link: a safe href, or empty. Empty means the block still needs a
 * link and does not render (blockNeed). It is accepted so a block whose unsafe
 * link was removed by the D57 scan can still be saved with the rest of the page.
 */
export const safeLinkUrlSchema = storedUrl(isSafeHref, UNSAFE_LINK_MESSAGE);

/** A stored embed URL: an http or https URL, or empty (see safeLinkUrlSchema). */
export const safeWebUrlSchema = storedUrl(isSafeWebUrl, UNSAFE_WEB_URL_MESSAGE);
