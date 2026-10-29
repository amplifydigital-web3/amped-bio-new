import type { ContentCard, ContentPlayback } from "@repo/constants";
import { requirePlayerSource, type PlayerItem, type SourceResolver } from "@repo/ui";
import { trpcClient } from "./trpc";

/**
 * Content on the public site (Build Board #20, spec 3.6 and 3.7). Playback URLs
 * are fetched in the browser after hydration, never rendered into server HTML.
 */

export function contentItemPath(handle: string, publicId: string): string {
  return `/${handle}/c/${publicId}`;
}

export function contentFeedPath(handle: string): string {
  return `/${handle}/content`;
}

/** Fresh signed URLs for an item. Never cached: they expire. */
export async function fetchPlayback(publicId: string): Promise<ContentPlayback | null> {
  const result = await trpcClient.content.getReadUrl.query({ publicId });
  return result.playback;
}

export function resolverFor(publicId: string): SourceResolver {
  return async () => requirePlayerSource(await fetchPlayback(publicId));
}

/** A single use download link, 2 minutes (decision 24). */
export async function fetchDownload(publicId: string) {
  const result = await trpcClient.content.getReadUrl.query({ publicId, download: true });
  return result.download;
}

export function playerItemFromCard(
  card: ContentCard,
  creator: { handle: string; name: string | null },
  chapters?: Array<{ startMs: number; title: string }>
): PlayerItem {
  return {
    id: card.publicId,
    kind: card.kind === "audio" ? "audio" : "video",
    title: card.title,
    subtitle: creator.name || `@${creator.handle}`,
    artwork: card.cover?.src ?? null,
    durationMs: card.durationMs,
    chapters: chapters ?? null,
    href: contentItemPath(creator.handle, card.publicId),
  };
}

/** "Today", "Yesterday", "3 days ago", then "Oct 6" (this year) or "Oct 6, 2025". */
export function publishedLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = 24 * 3600 * 1000;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / day);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** ISO 8601 duration for JSON-LD: 760000 ms to "PT12M40S". */
export function isoDuration(ms: number | null | undefined): string | undefined {
  if (!ms || ms <= 0) return undefined;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}
