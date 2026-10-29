"use client";

import Link from "next/link";
import {
  FileArchive,
  FileText,
  Film,
  Headphones,
  Image as ImageIcon,
  Maximize2,
  Play,
} from "lucide-react";
import { contentCardMeta, type ContentCard } from "@repo/constants";
import { cn } from "@repo/ui";
import { publishedLabel } from "@/lib/content";
import { SITE_CONTENT_COPY as copy } from "./copy";
import { CREATOR_FOCUS_RING } from "./theme";

const KIND_ICON = {
  video: Film,
  audio: Headphones,
  image: ImageIcon,
  document: FileText,
  file: FileArchive,
} as const;

function formatShortClock(ms: number) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The cover well: cover or blur, a kind glyph when there is none, the action pill. */
export function CardCover({
  card,
  className,
  sizes,
  showPill = true,
  eager = false,
}: {
  card: ContentCard;
  className?: string;
  sizes?: string;
  showPill?: boolean;
  eager?: boolean;
}) {
  const Icon = KIND_ICON[card.kind];
  const timed = card.kind === "video" || card.kind === "audio";
  return (
    <div
      className={cn("relative overflow-hidden rounded-[13px] bg-black/10", className)}
      style={
        card.blur ? { backgroundImage: `url(${card.blur})`, backgroundSize: "cover" } : undefined
      }
    >
      {card.cover ? (
        <img
          src={card.cover.src}
          srcSet={card.cover.srcSet || undefined}
          sizes={sizes}
          alt=""
          loading={eager ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center opacity-60">
          <Icon className="h-9 w-9" aria-hidden />
        </span>
      )}
      {timed && card.durationMs ? (
        <span className="absolute right-[8px] top-[8px] rounded-[8px] bg-black/75 px-[8px] py-[2px] text-[13px] font-semibold tabular-nums text-white">
          {formatShortClock(card.durationMs)}
        </span>
      ) : null}
      {showPill && (timed || card.kind === "image") && (
        <span
          aria-hidden
          className="absolute bottom-[8px] left-[8px] inline-flex h-[44px] items-center gap-[8px] rounded-full bg-white pl-[4px] pr-[16px] text-[15px] font-semibold text-[#16152B] shadow"
        >
          <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-[#16152B] text-white">
            {timed ? <Play className="ml-0.5 h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </span>
          {timed ? copy.play : copy.view}
        </span>
      )}
    </div>
  );
}

/** A card that opens the item page (grid and feed). */
export function ContentCardLink({
  card,
  href,
  layout = "grid",
  sizes = "(min-width: 640px) 290px, 50vw",
}: {
  card: ContentCard;
  href: string;
  layout?: "grid" | "list";
  sizes?: string;
}) {
  const meta = contentCardMeta(card);
  const date = publishedLabel(card.publishedAt);
  if (layout === "list") {
    return (
      <Link
        href={href}
        className={cn("flex items-center gap-[13px] rounded-[13px] py-[4px]", CREATOR_FOCUS_RING)}
      >
        <CardCover
          card={card}
          className="aspect-square w-[89px] shrink-0"
          sizes="89px"
          showPill={false}
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[16px] font-semibold leading-[22px]">
            {card.title}
          </span>
          <span className="block text-[14px] leading-[20px] opacity-80" suppressHydrationWarning>
            {date ? `${meta}, ${date}` : meta}
          </span>
          <span className="mt-[2px] block text-[13px] opacity-70">{copy.public}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link href={href} className={cn("block rounded-[13px]", CREATOR_FOCUS_RING)}>
      <CardCover card={card} className="aspect-[4/3] w-full" sizes={sizes} />
      <span className="mt-[8px] line-clamp-2 block text-[16px] font-semibold leading-[22px]">
        {card.title}
      </span>
      <span className="block text-[14px] leading-[20px] opacity-80" suppressHydrationWarning>
        {date ? `${meta}, ${date}` : meta}
      </span>
    </Link>
  );
}
