"use client";

import { fontStylesheetHref, type AnyThemeConfig, type FontPick } from "@repo/constants";
import { lookFor, nameOnBio, type CreatorLook } from "./look";

/**
 * Theme Engine v2 fonts, phase 2b PR 1 (docs/features/theme-engine-v2.md,
 * 3.8): the stylesheets a creator page needs for catalog faces the base font
 * link does not draw. The name face asks for only the letters it shows: the
 * display name, plus the bio's first 120 characters when the name effect
 * also applies to the bio (that is when the bio wears the name face).
 *
 * Callers mount this only while the fontCatalog flag is on. PR 2 (delivery)
 * moves these files to Amped's own font host (decision 2).
 */

const BIO_LETTERS = 120;

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}

/** The body face: the theme's family with its weight, italic and axes. */
export function bodyFontPick(look: CreatorLook): FontPick {
  return { family: look.values.fontFamily || "Inter", ...look.values.bodyFontStyle };
}

/** Stylesheet URLs for the page's faces, name first. Empty when the base link covers them. */
export function creatorFontHrefs(
  theme: AnyThemeConfig | null | undefined,
  profile: { name: string; bio?: string | null }
): string[] {
  const look = lookFor(theme);
  const hrefs: string[] = [];
  if (look.nameFont) {
    const bio = nameOnBio(look) && profile.bio ? plainText(profile.bio).slice(0, BIO_LETTERS) : "";
    const text = `${profile.name || "Your name"}${bio}`;
    const href = fontStylesheetHref([look.nameFont], { text });
    if (href) hrefs.push(href);
  }
  const body = fontStylesheetHref([bodyFontPick(look)]);
  if (body) hrefs.push(body);
  return hrefs;
}

/** One stylesheet link per face. Links in the body are allowed for stylesheets. */
export function CreatorFontLinks({
  theme,
  profile,
}: {
  theme: AnyThemeConfig | null | undefined;
  profile: { name: string; bio?: string | null };
}) {
  const hrefs = creatorFontHrefs(theme, profile);
  if (hrefs.length === 0) return null;
  return (
    <>
      {hrefs.map(href => (
        <link key={href} rel="stylesheet" href={href} data-creator-font="" />
      ))}
    </>
  );
}
