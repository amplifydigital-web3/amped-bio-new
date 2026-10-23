"use client";

import { useId } from "react";
import Link from "next/link";
import {
  DEFAULT_CONTENT_BLOCK_CONFIG,
  contentCardMeta,
  type ContentBlock as ContentBlockType,
  type ContentCard,
  type ThemeConfig,
} from "@repo/constants";
import { MediaPlayer, cn } from "@repo/ui";
import { contentFeedPath, contentItemPath, playerItemFromCard, resolverFor } from "@/lib/content";
import { CardCover, ContentCardLink } from "./ContentCardView";
import { ReportContentButton } from "./ReportDialog";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING, creatorSurface } from "./theme";

/**
 * Content block on the creator's page (Build Board #20, spec 3.7, board cs4).
 * Featured plays the first video or track right on the page and shows the rest
 * as cards; grid and list open each item's page. Cards come from the server
 * (getHandle contentCards) for public items only, so a draft, an 18+ item or a
 * removed item never renders. A block with nothing left hides itself.
 */
export function ContentBlock({
  block,
  theme,
  cards,
  handle,
  creatorName,
}: {
  block: ContentBlockType;
  theme: ThemeConfig | undefined;
  cards: Record<string, ContentCard>;
  handle: string;
  creatorName: string | null;
}) {
  const headingId = useId();
  const config = { ...DEFAULT_CONTENT_BLOCK_CONFIG, ...block.config };
  const items = (config.publicIds ?? [])
    .map(id => cards[id])
    .filter((card): card is ContentCard => !!card);
  if (!items.length) return null;

  const creator = { handle, name: creatorName };
  const [first, ...rest] = items;
  const featured = config.layout === "featured" ? first! : null;
  const featuredPlays = featured && (featured.kind === "video" || featured.kind === "audio");
  const gridItems = featured ? rest : items;

  return (
    <section
      aria-labelledby={config.label ? headingId : undefined}
      aria-label={config.label ? undefined : copy.feedTitle}
      className="rounded-[21px] p-[21px]"
      style={creatorSurface(theme)}
    >
      <div className="mb-[13px] flex items-baseline justify-between gap-[13px]">
        {config.label ? (
          <h2 id={headingId} className="text-[20px] font-bold leading-[26px]">
            {config.label}
          </h2>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-[14px] opacity-80">{copy.items(items.length)}</span>
      </div>

      {featured && featuredPlays && (
        <div className="mb-[21px]">
          <MediaPlayer
            item={playerItemFromCard(featured, creator)}
            resolve={resolverFor(featured.publicId)}
            poster={featured.cover?.src ?? null}
          />
          <Link
            href={contentItemPath(handle, featured.publicId)}
            className={cn("mt-[13px] block rounded-[8px]", CREATOR_FOCUS_RING)}
          >
            <span className="block text-[18px] font-semibold leading-[24px]">{featured.title}</span>
            <span className="block text-[14px] opacity-80">
              {copy.playsHere(contentCardMeta(featured).split(",")[0]!)}
            </span>
          </Link>
        </div>
      )}
      {featured && !featuredPlays && (
        <Link
          href={contentItemPath(handle, featured.publicId)}
          className={cn("mb-[21px] block rounded-[13px]", CREATOR_FOCUS_RING)}
        >
          <CardCover
            card={featured}
            className="aspect-video w-full"
            sizes="(min-width: 640px) 568px, 100vw"
            eager
          />
          <span className="mt-[13px] block text-[18px] font-semibold leading-[24px]">
            {featured.title}
          </span>
          <span className="block text-[14px] opacity-80">{contentCardMeta(featured)}</span>
        </Link>
      )}

      {gridItems.length > 0 &&
        (config.layout === "list" ? (
          <ul className="flex flex-col gap-[8px]">
            {gridItems.map(card => (
              <li key={card.publicId}>
                <ContentCardLink
                  card={card}
                  href={contentItemPath(handle, card.publicId)}
                  layout="list"
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-x-[13px] gap-y-[21px]">
            {gridItems.map(card => (
              <li key={card.publicId}>
                <ContentCardLink card={card} href={contentItemPath(handle, card.publicId)} />
              </li>
            ))}
          </ul>
        ))}

      <div className="mt-[21px] flex flex-wrap items-center justify-between gap-[8px]">
        <ReportContentButton
          items={items.map(card => ({ publicId: card.publicId, title: card.title }))}
        />
        <Link
          href={contentFeedPath(handle)}
          className={cn(
            "inline-flex min-h-[44px] items-center text-[15px] font-semibold underline underline-offset-2",
            CREATOR_FOCUS_RING
          )}
        >
          {copy.seeAll}
        </Link>
      </div>
    </section>
  );
}
