"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import type { ContentCard, ContentFeedPage, ContentUploadKind } from "@repo/constants";
import { cn } from "@repo/ui";
import { contentItemPath } from "@/lib/content";
import { trpcClient } from "@/lib/trpc";
import { ContentCardLink } from "./ContentCardView";
import { ReportContentButton } from "./ReportDialog";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

const KINDS: Array<ContentUploadKind | "all"> = [
  "all",
  "video",
  "audio",
  "document",
  "image",
  "file",
];

/**
 * The creator feed page (spec 3.7, board cs6; Fan Library row 127): public items
 * newest first, kind chips, cards that open each item. Locked cards arrive with
 * gated content (PR 8).
 */
export function FeedPageView({
  initial,
  kind,
}: {
  initial: ContentFeedPage;
  kind: ContentUploadKind | null;
}) {
  const { creator } = initial;
  const [items, setItems] = useState<ContentCard[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const more = async () => {
    if (!cursor) return;
    setLoading(true);
    setError(false);
    try {
      const page = await trpcClient.content.feed.query({
        handle: creator.handle,
        kind: kind ?? undefined,
        cursor,
        limit: 24,
      });
      setItems(current => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <header className="flex flex-wrap items-center gap-[13px]">
        {creator.image ? (
          <img
            src={creator.image}
            alt=""
            className="h-[55px] w-[55px] rounded-full object-cover sm:h-[89px] sm:w-[89px]"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] opacity-80">
            {copy.feedEyebrow(creator.name ?? "", creator.handle)}
          </p>
          <h1 className="text-[28px] font-bold leading-[34px] sm:text-[40px] sm:leading-[46px]">
            {copy.feedTitle}
          </h1>
        </div>
        <Link
          href={`/${creator.handle}`}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-[8px] rounded-full border border-current px-[16px] text-[15px] font-semibold",
            CREATOR_FOCUS_RING
          )}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
          {copy.backToPage}
        </Link>
      </header>

      <nav
        aria-label={copy.filters}
        className="-mx-[16px] mt-[21px] overflow-x-auto px-[16px] sm:mx-0 sm:px-0"
      >
        <ul className="flex gap-[8px]">
          {KINDS.map(value => {
            const active = (kind ?? "all") === value;
            const href =
              value === "all"
                ? `/${creator.handle}/content`
                : `/${creator.handle}/content?kind=${value}`;
            return (
              <li key={value} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-[4px] rounded-full border border-current px-[16px] text-[15px] font-semibold",
                    active && "border-transparent",
                    CREATOR_FOCUS_RING
                  )}
                  // The creator's own pair, swapped: their text color as the fill, the button color as the text
                  style={
                    active
                      ? { backgroundColor: "var(--amped-font)", color: "var(--amped-btn, #ffffff)" }
                      : undefined
                  }
                >
                  {active && <Check className="h-4 w-4" aria-hidden />}
                  {copy.kinds[value]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mt-[13px] text-[14px] opacity-80">{copy.newestFirst(items.length)}</p>

      {items.length === 0 ? (
        <div className="mt-[34px] text-center">
          <p className="text-[18px] font-semibold">{copy.emptyTitle}</p>
          <p className="mt-[4px] opacity-80">{kind ? copy.emptyKind : copy.emptyBody}</p>
          {kind && (
            <Link
              href={`/${creator.handle}/content`}
              className={cn(
                "mt-[13px] inline-flex min-h-[44px] items-center font-semibold underline",
                CREATOR_FOCUS_RING
              )}
            >
              {copy.showAll}
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-[21px] hidden grid-cols-2 gap-x-[21px] gap-y-[34px] sm:grid lg:grid-cols-4">
            {items.map(card => (
              <li key={card.publicId}>
                <ContentCardLink
                  card={card}
                  href={contentItemPath(creator.handle, card.publicId)}
                  sizes="(min-width: 1024px) 245px, 50vw"
                />
              </li>
            ))}
          </ul>
          <ul className="mt-[13px] flex flex-col gap-[13px] sm:hidden">
            {items.map(card => (
              <li key={card.publicId}>
                <ContentCardLink
                  card={card}
                  href={contentItemPath(creator.handle, card.publicId)}
                  layout="list"
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {cursor && (
        <div className="mt-[34px] flex flex-col items-center gap-[8px]">
          <button
            type="button"
            onClick={() => void more()}
            disabled={loading}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-[8px] rounded-full border border-current px-[21px] font-semibold",
              CREATOR_FOCUS_RING
            )}
          >
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {copy.more}
          </button>
          {error && (
            <p role="alert" className="text-[14px]">
              {copy.loadError}
            </p>
          )}
        </div>
      )}

      <div className="mt-[34px]">
        <ReportContentButton
          items={items.map(card => ({ publicId: card.publicId, title: card.title }))}
        />
      </div>
    </div>
  );
}
