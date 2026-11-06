import { BASE_FONT_STYLESHEET } from "@repo/constants";

/**
 * Theme Engine v2 fonts, phase 2b PR 2 (docs/features/theme-engine-v2.md 3.8):
 * the ten base families. While fontDelivery is on and the mirror is ready, the
 * API names the copy on Amped's media host and visitors never contact Google.
 * Otherwise the page keeps the Google stylesheet it has always loaded.
 */

const REVALIDATE_SECONDS = 300;
const LOAD_TIMEOUT_MS = 2_000;

export interface BaseFontLink {
  href: string;
  /** The origins the stylesheet and its files come from, for preconnect */
  preconnect: { href: string; crossOrigin?: "anonymous" }[];
}

export const GOOGLE_BASE_FONT_LINK: BaseFontLink = {
  href: BASE_FONT_STYLESHEET,
  preconnect: [
    { href: "https://fonts.googleapis.com" },
    { href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  ],
};

/** The mirrored URL when it is an https URL, else null */
export function parseBaseHref(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const href = (value as { baseHref?: unknown }).baseHref;
  return typeof href === "string" && href.startsWith("https://") ? href : null;
}

/** Server only: the base font stylesheet for the root layout. Never throws. */
export async function getBaseFontLink(): Promise<BaseFontLink> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? ""}/trpc/public.fontDelivery`,
      {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
      }
    );
    if (!response.ok) return GOOGLE_BASE_FONT_LINK;
    const body = (await response.json()) as { result?: { data?: unknown } };
    const href = parseBaseHref(body.result?.data);
    if (!href) return GOOGLE_BASE_FONT_LINK;
    return { href, preconnect: [{ href: new URL(href).origin, crossOrigin: "anonymous" }] };
  } catch {
    return GOOGLE_BASE_FONT_LINK;
  }
}
