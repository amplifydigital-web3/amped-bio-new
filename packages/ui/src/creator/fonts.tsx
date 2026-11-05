"use client";

import { creatorFontRequests, type AnyThemeConfig, type FontPick } from "@repo/constants";
import type { CreatorLook } from "./look";

/**
 * Theme Engine v2 fonts, phase 2b (docs/features/theme-engine-v2.md, 3.8): the
 * stylesheet links a creator page needs for catalog faces the base fonts do
 * not draw. The requests come from @repo/constants (creatorFontRequests), so
 * the API and this page name the same faces.
 *
 * PR 2 (delivery): on the public page the API passes the mirrored links on the
 * media host (getHandle fonts), and no visitor's browser contacts Google
 * (decision 2). Without them, the Google requests are used: the editor (the
 * creator's own browser) and staging before the mirror is configured.
 */

/** The body face: the theme's family with its weight, italic and axes. */
export function bodyFontPick(look: CreatorLook): FontPick {
  return { family: look.values.fontFamily || "Inter", ...look.values.bodyFontStyle };
}

/** Google stylesheet URLs for the page's faces, name first. Empty when the base fonts cover them. */
export function creatorFontHrefs(
  theme: AnyThemeConfig | null | undefined,
  profile: { name: string; bio?: string | null }
): string[] {
  return creatorFontRequests(theme, profile).map(request => request.url);
}

/** One stylesheet link per face. Links in the body are allowed for stylesheets. */
export function CreatorFontLinks({
  theme,
  profile,
  hrefs,
}: {
  theme: AnyThemeConfig | null | undefined;
  profile: { name: string; bio?: string | null };
  /** Mirrored links from the API (delivery). When set, these replace the Google requests. */
  hrefs?: readonly string[] | null;
}) {
  const links = hrefs ?? creatorFontHrefs(theme, profile);
  if (links.length === 0) return null;
  return (
    <>
      {links.map(href => (
        <link key={href} rel="stylesheet" href={href} data-creator-font="" />
      ))}
    </>
  );
}
