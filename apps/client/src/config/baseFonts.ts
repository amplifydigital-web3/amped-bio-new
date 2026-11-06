import { BASE_FONT_STYLESHEET } from "@repo/constants";
import { isFeatureOn } from "./featureFlags";

/**
 * Theme Engine v2 fonts, phase 2b PR 2 (docs/features/theme-engine-v2.md 3.8):
 * the ten base families. main.tsx links them once flags have loaded. While
 * fontDelivery is on and the mirror is ready, the stylesheet comes from
 * Amped's media host; otherwise from Google, as index.html did before.
 */

const LOAD_TIMEOUT_MS = 1_500;

/** The mirrored URL when it is an https URL, else null */
export function parseBaseHref(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const href = (value as { baseHref?: unknown }).baseHref;
  return typeof href === "string" && href.startsWith("https://") ? href : null;
}

async function mirroredHref(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
  try {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/trpc/public.fontDelivery`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: { data?: unknown } };
    return parseBaseHref(body.result?.data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function link(rel: string, href: string, crossOrigin?: boolean) {
  const el = document.createElement("link");
  el.rel = rel;
  el.href = href;
  if (crossOrigin) el.crossOrigin = "anonymous";
  document.head.appendChild(el);
}

/** Links the base stylesheet. Never throws; Google is the fallback. */
export async function linkBaseFonts(): Promise<void> {
  const mirrored = isFeatureOn("fontDelivery") ? await mirroredHref() : null;
  if (mirrored) {
    link("preconnect", new URL(mirrored).origin, true);
    link("stylesheet", mirrored);
    return;
  }
  link("preconnect", "https://fonts.googleapis.com");
  link("preconnect", "https://fonts.gstatic.com", true);
  link("stylesheet", BASE_FONT_STYLESHEET);
}
