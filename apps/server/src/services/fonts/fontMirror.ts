import { createHash } from "crypto";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  BASE_FONT_STYLESHEET,
  GOOGLE_FONTS_FILE_ORIGIN,
  NAME_FONT_MAX_BYTES,
  creatorFontRequests,
  fontCssKey,
  isGoogleFontsStylesheet,
  mirroredFontUrl,
  type AnyThemeConfig,
} from "@repo/constants";
import { prisma } from "@repo/database";
import { env } from "../../env";
import { isFeatureOn } from "../featureFlags";
import { getR2Client } from "../cloudflare/r2";
import { fallbackFace, woff2Metrics } from "./woff2Metrics";

/**
 * Theme Engine v2 fonts, phase 2b PR 2 (docs/features/theme-engine-v2.md 3.8,
 * decision 2): the font mirror. The API, never a visitor's browser, reads a
 * stylesheet from Google Fonts, copies each WOFF2 file it names to the media
 * bucket (content addressed: fonts/files/<sha256>.woff2), rewrites the URLs to
 * the media host, adds a metric matched "<Family> Fallback" face, and stores
 * the result under fonts/<family>/<hash of the request>.css. The media
 * gateway serves fonts/ without a token, with long caching and open CORS.
 *
 * Runs only while the fontDelivery flag is on and the media host and R2 are
 * configured. A page asks for a stylesheet that is not mirrored yet: the
 * mirror starts in the background and the page shows the fallback font this
 * once; the next visit gets the font.
 */

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CSS_BYTES = 200 * 1024;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
const MAX_FILES = 80;
const KNOWN_TTL_MS = 10 * 60 * 1000;
const IMMUTABLE = "public, max-age=31536000, immutable";

/** True when fonts are served from Amped's own host. */
export function fontDeliveryOn(): boolean {
  return (
    isFeatureOn("fontDelivery") &&
    Boolean(env.MEDIA_GATEWAY_ORIGIN) &&
    Boolean(env.CF_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET)
  );
}

// Stylesheets known to be in the bucket, with when that was confirmed
const known = new Map<string, number>();
const running = new Map<string, Promise<boolean>>();

async function fetchLimited(url: string, maxBytes: number, accept: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { "User-Agent": CHROME_UA, Accept: accept },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`fonts: ${response.status} from ${new URL(url).host}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("fonts: response too large");
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) throw new Error("fonts: response too large");
  return body;
}

async function exists(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function put(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: IMMUTABLE,
    })
  );
}

// The local font a fallback scales: Times New Roman for serif families,
// Courier New for monospace, Arial otherwise. By name, so the API does not
// load the 1,908 family catalog for this one choice.
const SERIF =
  /serif|garamond|baskerville|lora|playfair|merriweather|fraunces|bodoni|caslon|didot|crimson|cormorant|spectral|prata|cardo|vollkorn|libre|abril|domine|gelasio|newsreader|literata|young serif|instrument/i;
const MONO = /mono|code|courier|terminal/i;

export function fallbackKind(family: string): "serif" | "sans" | "mono" {
  if (MONO.test(family)) return "mono";
  if (SERIF.test(family) && !/sans/i.test(family)) return "serif";
  return "sans";
}

/** Each family a Google stylesheet defines, with the first file it names (latin last, so prefer it). */
function firstFileByFamily(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of css.matchAll(/(\/\*\s*([a-z-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)) {
    const subset = block[2];
    const body = block[3] ?? "";
    const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
    const url = /url\(([^)]+)\)/.exec(body)?.[1]?.replace(/['"]/g, "");
    if (!family || !url) continue;
    // The latin subset measures what the fallback stands in for; else the first one seen
    if (!out.has(family) || subset === "latin") out.set(family, url);
  }
  return out;
}

/**
 * Mirrors one Google Fonts stylesheet. Returns the rewritten CSS. Exported for
 * tests; callers use ensureMirrored.
 */
export async function mirrorStylesheet(googleUrl: string): Promise<string> {
  if (!isGoogleFontsStylesheet(googleUrl)) throw new Error("fonts: not a Google Fonts stylesheet");
  const origin = env.MEDIA_GATEWAY_ORIGIN;
  const css = new TextDecoder().decode(await fetchLimited(googleUrl, MAX_CSS_BYTES, "text/css"));
  const urls = [
    ...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]!.replace(/['"]/g, ""))),
  ];
  if (urls.length === 0 || urls.length > MAX_FILES) throw new Error("fonts: unexpected stylesheet");
  const isName = /[?&]text=/.test(googleUrl);
  const rewritten = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  for (const url of urls) {
    // Only files on Google's font host, never anything the stylesheet points elsewhere
    if (!url.startsWith(`${GOOGLE_FONTS_FILE_ORIGIN}/`))
      throw new Error("fonts: file off the font host");
    const file = await fetchLimited(url, MAX_FILE_BYTES, "font/woff2");
    if (isName && file.byteLength > NAME_FONT_MAX_BYTES) {
      console.warn(JSON.stringify({ event: "font_name_over_budget", bytes: file.byteLength }));
    }
    files.set(url, file);
    const key = `fonts/files/${createHash("sha256").update(file).digest("hex")}.woff2`;
    if (!(await exists(key))) await put(key, file, "font/woff2");
    rewritten.set(url, mirroredFontUrl(origin, key));
  }
  let out = css.replace(/url\(([^)]+)\)/g, (_match, raw: string) => {
    const url = raw.replace(/['"]/g, "");
    return `url(${rewritten.get(url) ?? url})`;
  });
  // A size matched fallback for each family, from that family's own file
  for (const [family, url] of firstFileByFamily(css)) {
    const file = files.get(url);
    const metrics = file ? woff2Metrics(file) : null;
    if (metrics) out += `\n${fallbackFace(family, metrics, fallbackKind(family))}\n`;
  }
  await put(fontCssKey(googleUrl), out, "text/css; charset=utf-8");
  return out;
}

/**
 * True when the stylesheet's mirror is in the bucket. When it is not, starts
 * the mirror in the background (once per stylesheet) and returns false.
 */
export async function ensureMirrored(googleUrl: string, wait = false): Promise<boolean> {
  const key = fontCssKey(googleUrl);
  const seen = known.get(key);
  if (seen && Date.now() - seen < KNOWN_TTL_MS) return true;
  if (await exists(key)) {
    known.set(key, Date.now());
    return true;
  }
  let job = running.get(key);
  if (!job) {
    job = mirrorStylesheet(googleUrl)
      .then(() => {
        known.set(key, Date.now());
        return true;
      })
      .catch(error => {
        console.error(JSON.stringify({ event: "font_mirror_failed", key, error: String(error) }));
        return false;
      })
      .finally(() => running.delete(key));
    running.set(key, job);
  }
  return wait ? job : false;
}

/** The mirrored base stylesheet (the ten families) on the media host, or null. */
export async function baseFontHref(): Promise<string | null> {
  if (!fontDeliveryOn()) return null;
  const ready = await ensureMirrored(BASE_FONT_STYLESHEET);
  return ready ? mirroredFontUrl(env.MEDIA_GATEWAY_ORIGIN, fontCssKey(BASE_FONT_STYLESHEET)) : null;
}

/**
 * The font links a public creator page loads, all on the media host, or null
 * while delivery is off (the page then keeps the Google requests, as before
 * this PR). Faces not mirrored yet are left out and start mirroring.
 */
export async function publicFontLinks(
  theme: AnyThemeConfig | null | undefined,
  profile: { name: string; bio?: string | null }
): Promise<string[] | null> {
  if (!fontDeliveryOn()) return null;
  const links: string[] = [];
  for (const request of creatorFontRequests(theme, profile)) {
    if (await ensureMirrored(request.url)) {
      links.push(mirroredFontUrl(env.MEDIA_GATEWAY_ORIGIN, fontCssKey(request.url)));
    }
  }
  return links;
}

/** Starts the mirrors a theme needs, right after it is saved, so the first visitor gets the font. */
export function prewarmThemeFonts(
  theme: AnyThemeConfig | null | undefined,
  profile: { name: string; bio?: string | null }
): void {
  if (!fontDeliveryOn()) return;
  for (const request of creatorFontRequests(theme, profile)) void ensureMirrored(request.url);
}

/** prewarmThemeFonts for a user's saved theme, reading their name and bio. Never throws. */
export function prewarmUserFonts(userId: number, theme: AnyThemeConfig | null | undefined): void {
  if (!fontDeliveryOn() || !theme) return;
  void prisma.user
    .findUnique({ where: { id: userId }, select: { name: true, description: true } })
    .then(user => user && prewarmThemeFonts(theme, { name: user.name, bio: user.description }))
    .catch(error =>
      console.error(JSON.stringify({ event: "font_prewarm_failed", error: String(error) }))
    );
}

/** Test hook: forget what the mirror has seen. */
export function resetFontMirrorForTests(): void {
  known.clear();
  running.clear();
}
