import { isNameEntrance } from "../effects/names";
import { getEffect } from "../effects/registry";
import { upgradeTheme } from "../effects/legacy";
import type { AnyThemeConfig } from "../theme";
import { fontRangeStylesheetHref, fontStylesheetHref } from "./index";
import { FONT_STORAGE_PREFIX } from "./keys";
import type { FontPick } from "./types";

/**
 * Theme Engine v2 fonts, phase 2b PR 2: delivery (docs/features/theme-engine-v2.md
 * 3.8, decision 2). The server mirrors each stylesheet a page needs from
 * Google Fonts to Amped's own storage, and visitors' browsers load only the
 * mirror on the media host. Shared here so the API, the landing page and the
 * editor name the same requests and the same storage keys.
 */

/** The ten base families at the weights both apps have always loaded. */
export const BASE_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Open+Sans:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Figtree:wght@400;500;600;700&family=Bebas+Neue&family=Playfair+Display:wght@400;600;700&family=Lora:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap";

/** The only host a mirror reads stylesheets from, and the only host of the files in them. */
export const GOOGLE_FONTS_CSS_ORIGIN = "https://fonts.googleapis.com";
export const GOOGLE_FONTS_FILE_ORIGIN = "https://fonts.gstatic.com";

export {
  FONT_CSS_KEY_PATTERN,
  FONT_FILE_KEY_PATTERN,
  FONT_STORAGE_PREFIX,
  isFontKey,
} from "./keys";

/** The name font asks for only the letters on the page; it must stay under 10 KB (spec 3.8). */
export const NAME_FONT_MAX_BYTES = 10 * 1024;

const BIO_LETTERS = 120;

/** FNV-1a, 32 bit, base 36: a short stable id for a request URL. Not a security hash. */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "font"
  );
}

/** True for a Google Fonts css2 URL a mirror may fetch. */
export function isGoogleFontsStylesheet(url: string): boolean {
  // The fixed origin then /css2?, so the host cannot change. "@" is part of the
  // axis syntax (wght@400); whitespace, fragments and backslashes are refused.
  return url.startsWith(`${GOOGLE_FONTS_CSS_ORIGIN}/css2?`) && !/[\s#\\]/.test(url);
}

/** The storage key of a stylesheet's mirror: fonts/<first family>/<hash>.css, or fonts/base/... */
export function fontCssKey(googleUrl: string): string {
  if (googleUrl === BASE_FONT_STYLESHEET) {
    return `${FONT_STORAGE_PREFIX}/base/${shortHash(googleUrl)}.css`;
  }
  const family = /[?&]family=([^:&]+)/.exec(googleUrl)?.[1]?.replace(/\+/g, " ") ?? "font";
  return `${FONT_STORAGE_PREFIX}/${slug(family)}/${shortHash(googleUrl)}.css`;
}

/** The public URL of a mirrored key on the media host. */
export function mirroredFontUrl(origin: string, key: string): string {
  return `${origin.replace(/\/+$/, "")}/${key}`;
}

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}

function pickOf(font: {
  family: string;
  weight: number;
  italic: boolean;
  axes: Readonly<Record<string, number>>;
}): FontPick {
  const pick: FontPick = { family: font.family, weight: font.weight };
  if (font.italic) pick.italic = true;
  const axes: NonNullable<FontPick["axes"]> = {};
  if (typeof font.axes["wdth"] === "number") axes.wdth = font.axes["wdth"];
  if (typeof font.axes["opsz"] === "number") axes.opsz = font.axes["opsz"];
  if (Object.keys(axes).length > 0) pick.axes = axes;
  return pick;
}

export interface CreatorFontRequest {
  role: "name" | "body";
  /** The Google Fonts css2 URL a mirror fetches */
  url: string;
}

/**
 * The stylesheets a creator page needs beyond the base families, name first.
 * The name face asks for only its letters: the display name, plus the bio's
 * first 120 characters when the name effect also dresses the bio.
 */
export function creatorFontRequests(
  theme: AnyThemeConfig | null | undefined,
  profile: { name: string; bio?: string | null }
): CreatorFontRequest[] {
  const v2 = upgradeTheme(theme ?? undefined);
  const { name, body } = v2.fonts;
  const out: CreatorFontRequest[] = [];
  // TE-3e2 Weight pulse: the name face across Lightest to Boldest, always its own request
  if (v2.name.id === "name.weight-pulse") {
    const lightest = Number(v2.name.params["lightest"]) || 300;
    const boldest = Number(v2.name.params["boldest"]) || 900;
    const url = fontRangeStylesheetHref(pickOf(name), [lightest, boldest], {
      text: profile.name || "Your name",
    });
    if (url) out.push({ role: "name", url });
  }
  const nameDiffers =
    name.family !== body.family ||
    name.weight !== 700 ||
    name.italic ||
    Object.keys(name.axes).length > 0;
  if (nameDiffers && v2.name.id !== "name.weight-pulse") {
    const effect = getEffect("name", v2.name.id);
    const dressesBio =
      v2.name.appliesTo === "nameAndBio" && effect.id !== "name.none" && !isNameEntrance(effect);
    const bio = dressesBio && profile.bio ? plainText(profile.bio).slice(0, BIO_LETTERS) : "";
    const url = fontStylesheetHref([pickOf(name)], {
      text: `${profile.name || "Your name"}${bio}`,
    });
    if (url) out.push({ role: "name", url });
  }
  const bodyUrl = fontStylesheetHref([pickOf(body)]);
  if (bodyUrl) out.push({ role: "body", url: bodyUrl });
  return out;
}

/** The family a mirrored stylesheet defines for the metric matched fallback (spec 3.8). */
export function fallbackFamily(family: string): string {
  return `${family} Fallback`;
}
