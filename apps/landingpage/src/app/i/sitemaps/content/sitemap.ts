import type { MetadataRoute } from "next";
import { fetchContentSitemapCount, fetchContentSitemapEntries } from "@/lib/getContentData";
import { contentFeedUrl, contentItemUrl } from "@/lib/contentSeo";
import { PROFILE_SITEMAP_PAGE_SIZE } from "@/lib/seo";

export const revalidate = 3600;

/**
 * Public content items and the feed pages that hold them (content system
 * decision 23). Gated and 18+ items never appear: the API lists public items
 * only. One file per 10,000 items.
 */
export async function generateSitemaps() {
  const total = await fetchContentSitemapCount();
  const files = Math.max(1, Math.ceil(total / PROFILE_SITEMAP_PAGE_SIZE));
  return Array.from({ length: files }, (_, id) => ({ id }));
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const page = Number.parseInt(await props.id, 10);
  if (!Number.isInteger(page) || page < 0) return [];
  const entries = await fetchContentSitemapEntries(page, PROFILE_SITEMAP_PAGE_SIZE);
  const feeds = new Map<string, string>();
  for (const entry of entries) {
    const latest = feeds.get(entry.handle);
    if (!latest || entry.lastModified > latest) feeds.set(entry.handle, entry.lastModified);
  }
  return [
    ...[...feeds].map(([handle, lastModified]) => ({
      url: contentFeedUrl(handle),
      lastModified: new Date(lastModified),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...entries.map(entry => ({
      url: contentItemUrl(entry.handle, entry.publicId),
      lastModified: new Date(entry.lastModified),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
