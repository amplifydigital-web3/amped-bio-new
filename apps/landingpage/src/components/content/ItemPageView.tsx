"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Share2 } from "lucide-react";
import { contentCardMeta, type ContentPublicItem } from "@repo/constants";
import { ChapterList, MediaPlayer, cn } from "@repo/ui";
import { contentFeedPath, playerItemFromCard, resolverFor } from "@/lib/content";
import { CardCover } from "./ContentCardView";
import { DownloadButton } from "./DownloadButton";
import { PdfViewer } from "./PdfViewer";
import { ReportContentButton } from "./ReportDialog";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

const PILL = cn(
  "inline-flex min-h-[44px] items-center gap-[4px] rounded-full border border-current px-[16px] text-[16px] font-semibold",
  CREATOR_FOCUS_RING
);

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Dismissed share sheet; nothing to do
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? copy.shareCopied : copy.share}
      className={cn(
        "inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-current",
        CREATOR_FOCUS_RING
      )}
    >
      <Share2 className="h-5 w-5" aria-hidden />
      <span className="sr-only" role="status">
        {copied ? copy.shareCopied : ""}
      </span>
    </button>
  );
}

/**
 * The item page (spec 3.7, board cs7). Public items in PR 6: the player or
 * viewer, the creator, title, description, chapters, Download when allowed,
 * Report. Playback URLs are fetched here in the browser, never in server HTML.
 */
export function ItemPageView({ item }: { item: ContentPublicItem }) {
  const { creator } = item;
  const timed = item.kind === "video" || item.kind === "audio";
  const playerItem = playerItemFromCard(item, creator, item.chapters);
  const resolve = resolverFor(item.publicId);

  return (
    <article>
      <div className="mb-[21px] flex items-center justify-between gap-[13px]">
        <Link href={`/${creator.handle}`} className={PILL} aria-label={copy.backTo(creator.handle)}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
          {creator.handle}
        </Link>
        <ShareButton title={item.title} />
      </div>

      {timed ? (
        <MediaPlayer item={playerItem} resolve={resolve} poster={item.cover?.src ?? null} />
      ) : item.kind === "image" ? (
        item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover.src}
            srcSet={item.cover.srcSet || undefined}
            sizes="(min-width: 640px) 610px, 100vw"
            alt={item.title}
            className="w-full rounded-[13px] bg-black/10 object-contain"
          />
        ) : null
      ) : item.documentFormat === "pdf" ? (
        <PdfViewer publicId={item.publicId} fallbackPages={[]} title={item.title} />
      ) : (
        <CardCover card={item} className="aspect-video w-full" showPill={false} eager />
      )}

      <div className="mt-[21px] flex items-center gap-[13px]">
        {creator.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.image} alt="" className="h-[44px] w-[44px] rounded-full object-cover" />
        ) : null}
        <Link href={`/${creator.handle}`} className={cn("text-[17px]", CREATOR_FOCUS_RING)}>
          @{creator.handle}
        </Link>
      </div>
      <h1 className="mt-[13px] text-[28px] font-bold leading-[34px]">{item.title}</h1>
      <p className="mt-[4px] text-[15px] opacity-80">{contentCardMeta(item)}</p>
      {item.description && (
        <p className="mt-[13px] whitespace-pre-line text-[17px] leading-[26px] opacity-90">
          {item.description}
        </p>
      )}

      {timed && (
        <ChapterList
          item={playerItem}
          resolve={resolve}
          className="mt-[21px]"
          headingClassName="opacity-80"
        />
      )}

      {item.allowDownload ? (
        <DownloadButton publicId={item.publicId} className="mt-[21px]" />
      ) : item.kind === "file" ? (
        <p className="mt-[21px] text-[15px] opacity-80">{copy.downloadsOff}</p>
      ) : null}
      {item.documentFormat === "epub" && item.allowDownload && (
        <p className="mt-[8px] text-[14px] opacity-80">{copy.epubNote}</p>
      )}

      <div className="mt-[21px] flex flex-wrap items-center justify-between gap-[13px]">
        <ReportContentButton
          items={[{ publicId: item.publicId, title: item.title }]}
          label={copy.report}
        />
        <Link
          href={contentFeedPath(creator.handle)}
          className={cn(
            "min-h-[44px] content-center text-[15px] font-semibold underline underline-offset-2",
            CREATOR_FOCUS_RING
          )}
        >
          {copy.seeAll}
        </Link>
      </div>
    </article>
  );
}
