import { contentCardMeta, type ContentFeedPage, type ContentPublicItem } from "@repo/constants";
import { isoDuration } from "./content";
import { SITE_NAME, SITE_URL, canonicalProfileUrl, truncateText } from "./seo";

export function contentItemUrl(handle: string, publicId: string): string {
  return `${SITE_URL}/${handle.toLowerCase()}/c/${publicId}`;
}

export function contentFeedUrl(handle: string): string {
  return `${SITE_URL}/${handle.toLowerCase()}/content`;
}

export function contentItemTitle(item: ContentPublicItem): string {
  const by = item.creator.name?.trim() || `@${item.creator.handle}`;
  return `${item.title} by ${by} | ${SITE_NAME}`;
}

export function contentItemDescription(item: ContentPublicItem): string {
  const text = item.description ? truncateText(item.description) : "";
  return text || `${contentCardMeta(item)} from @${item.creator.handle} on ${SITE_NAME}.`;
}

/**
 * schema.org data for a public item (spec decision 23). No content URL: media
 * is only reachable through short lived signed URLs, which never belong in
 * indexes. The thumbnail is the cover, which is public for public items.
 */
export function buildContentItemJsonLd(item: ContentPublicItem) {
  const url = contentItemUrl(item.creator.handle, item.publicId);
  const type =
    item.kind === "video"
      ? "VideoObject"
      : item.kind === "audio"
        ? "AudioObject"
        : item.kind === "image"
          ? "ImageObject"
          : item.kind === "document"
            ? "DigitalDocument"
            : "CreativeWork";
  const description = item.description ? truncateText(item.description, 500) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": type,
    name: item.title,
    url,
    ...(description ? { description } : {}),
    ...(item.cover ? { thumbnailUrl: item.cover.src } : {}),
    ...(item.publishedAt ? { uploadDate: item.publishedAt, datePublished: item.publishedAt } : {}),
    ...(isoDuration(item.durationMs) ? { duration: isoDuration(item.durationMs) } : {}),
    ...(item.pageCount ? { numberOfPages: item.pageCount } : {}),
    author: {
      "@type": "Person",
      name: item.creator.name?.trim() || `@${item.creator.handle}`,
      url: canonicalProfileUrl(item.creator.handle),
    },
  };
}

/** The feed page as a collection of its items. */
export function buildContentFeedJsonLd(feed: ContentFeedPage) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${feed.creator.name?.trim() || `@${feed.creator.handle}`} content`,
    url: contentFeedUrl(feed.creator.handle),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: feed.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: contentItemUrl(feed.creator.handle, item.publicId),
        name: item.title,
      })),
    },
  };
}
