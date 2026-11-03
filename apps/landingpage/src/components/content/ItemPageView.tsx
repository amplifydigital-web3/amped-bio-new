"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Share2 } from "lucide-react";
import { contentCardMeta, type ContentPublicItem } from "@repo/constants";
import {
  ChapterList,
  MediaPlayer,
  PhotoViewer,
  PlayerActions,
  UpNextList,
  cn,
  useOptionalPlayer,
} from "@repo/ui";
import { useFeatureFlag } from "@/components/providers/FeatureFlagsProvider";
import { contentFeedPath, fetchUpNext, playerItemFromCard, resolverFor } from "@/lib/content";
import { CardCover } from "./ContentCardView";
import { DownloadButton } from "./DownloadButton";
import { PdfViewer } from "./PdfViewer";
import { ReportContentButton, ReportDialog } from "./ReportDialog";
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
  const playerItem = useMemo(
    () => playerItemFromCard(item, creator, item.chapters),
    [item, creator]
  );
  const resolve = useMemo(() => resolverFor(item.publicId), [item.publicId]);
  const router = useRouter();
  const player = useOptionalPlayer();
  // FL-1: up next from the creator, the queue and the phone action row
  const fanLibrary = useFeatureFlag("fanLibrary");
  const playerV2 = fanLibrary && timed;
  const [reporting, setReporting] = useState(false);
  const creatorName = creator.name || `@${creator.handle}`;
  const reportItems = [{ publicId: item.publicId, title: item.title }];

  const setUpNext = player?.setUpNext;
  useEffect(() => {
    if (!playerV2 || !setUpNext) return;
    let live = true;
    void fetchUpNext(creator, item.publicId)
      .then(entries => live && setUpNext(entries))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [playerV2, creator, item.publicId, setUpNext]);

  // Swipe down on the phone video: back to where the fan came from, and the
  // mini player carries on there (the provider lives in the handle layout)
  const minimize = () => {
    if (window.history.length > 1) router.back();
    else router.push(`/${creator.handle}`);
  };

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
        <MediaPlayer
          item={playerItem}
          resolve={resolve}
          poster={item.cover?.src ?? null}
          onMinimize={playerV2 ? minimize : undefined}
          creatorName={creatorName}
        />
      ) : item.kind === "image" ? (
        item.cover ? (
          <PhotoViewer
            images={[{ src: item.cover.src, srcSet: item.cover.srcSet, alt: item.title }]}
          />
        ) : null
      ) : item.documentFormat === "pdf" ? (
        <PdfViewer publicId={item.publicId} fallbackPages={[]} title={item.title} />
      ) : (
        <CardCover card={item} className="aspect-video w-full" showPill={false} eager />
      )}

      <div className="mt-[21px] flex items-center gap-[13px]">
        {creator.image ? (
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

      {playerV2 && (
        <PlayerActions
          item={playerItem}
          resolve={resolve}
          onReport={() => setReporting(true)}
          note={item.allowDownload ? null : copy.downloadsOff}
          creatorName={creatorName}
          className="mt-[21px]"
        />
      )}

      {timed && (
        <ChapterList
          item={playerItem}
          resolve={resolve}
          className={cn("mt-[21px]", playerV2 && "hidden md:block")}
          headingClassName="opacity-80"
        />
      )}

      {playerV2 && <UpNextList item={playerItem} creatorName={creatorName} className="mt-[21px]" />}

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
          items={reportItems}
          label={copy.report}
          className={cn(playerV2 && "md:hidden")}
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
      {reporting && <ReportDialog items={reportItems} onClose={() => setReporting(false)} />}
    </article>
  );
}
