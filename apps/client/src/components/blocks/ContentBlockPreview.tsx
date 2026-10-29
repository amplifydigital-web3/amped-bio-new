import { useQuery } from "@tanstack/react-query";
import { FileArchive, FileText, Film, Headphones, Image as ImageIcon, Play } from "lucide-react";
import {
  DEFAULT_CONTENT_BLOCK_CONFIG,
  contentCardMeta,
  type ContentBlock,
  type ContentCard,
} from "@repo/constants";
import { THEME_DEFAULTS, trpc, useAuth } from "@repo/ui";
import type { ThemeConfig } from "../../types/editor";

const KIND_ICON = {
  video: Film,
  audio: Headphones,
  image: ImageIcon,
  document: FileText,
  file: FileArchive,
};

/**
 * The live preview's content block (spec 3.7, board cs4). It reads the same
 * public cards visitors get (content.listForBio), so drafts and items in review
 * stay out of the preview as they do on the page. Media does not play here;
 * the item editor has the player.
 */
export function ContentBlockPreview({
  block,
  theme,
}: {
  block: ContentBlock;
  theme: ThemeConfig | undefined;
}) {
  const { authUser } = useAuth();
  const config = { ...DEFAULT_CONTENT_BLOCK_CONFIG, ...block.config };
  const handle = authUser?.handle ?? "";
  const ids = config.publicIds;
  const cards = useQuery({
    ...trpc.content.listForBio.queryOptions({ handle, publicIds: ids }),
    enabled: !!handle && ids.length > 0,
    staleTime: 60_000,
  });
  const items = ids
    .map(id => (cards.data?.cards as Record<string, ContentCard> | undefined)?.[id])
    .filter((card): card is ContentCard => !!card);

  const transparency = theme?.transparency ?? THEME_DEFAULTS.transparency;
  const alpha = Math.round(Math.max(transparency, 40) * 2.55)
    .toString(16)
    .padStart(2, "0");
  const button = theme?.buttonColor || THEME_DEFAULTS.buttonColor;
  const style = {
    backgroundColor: /^#[0-9a-f]{6}$/i.test(button) ? `${button}${alpha}` : button,
    color: theme?.fontColor || THEME_DEFAULTS.fontColor,
    fontFamily: theme?.fontFamily,
  };

  return (
    <section
      className="rounded-[21px] p-[21px]"
      style={style}
      aria-label={config.label || "Content"}
    >
      <div className="mb-[13px] flex items-baseline justify-between gap-[13px]">
        {config.label ? (
          <h2 className="text-[20px] font-bold leading-[26px]">{config.label}</h2>
        ) : (
          <span />
        )}
        <span className="text-[14px] opacity-80">
          {items.length === 1 ? "1 item" : `${items.length} items`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-[14px] opacity-80">
          {cards.isLoading ? "Loading" : "Publish an item in Content to show it here."}
        </p>
      ) : (
        <ul
          className={
            config.layout === "list" ? "flex flex-col gap-[8px]" : "grid grid-cols-2 gap-[13px]"
          }
        >
          {items.map((card, index) => {
            const Icon = KIND_ICON[card.kind];
            const big = config.layout === "featured" && index === 0;
            return (
              <li
                key={card.publicId}
                className={
                  big
                    ? "col-span-2"
                    : config.layout === "list"
                      ? "flex items-center gap-[13px]"
                      : ""
                }
              >
                <div
                  className={
                    config.layout === "list"
                      ? "relative aspect-square w-[55px] shrink-0 overflow-hidden rounded-[8px] bg-black/10"
                      : `relative ${big ? "aspect-video" : "aspect-[4/3]"} overflow-hidden rounded-[13px] bg-black/10`
                  }
                >
                  {card.cover ? (
                    <img src={card.cover.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center opacity-60">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                  )}
                  {big && (card.kind === "video" || card.kind === "audio") && (
                    <span className="absolute bottom-2 left-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#16152B]">
                      <Play className="ml-0.5 h-4 w-4" aria-hidden />
                    </span>
                  )}
                </div>
                <div className={config.layout === "list" ? "min-w-0" : "mt-[6px]"}>
                  <p className="line-clamp-2 text-[15px] font-semibold leading-[20px]">
                    {card.title}
                  </p>
                  <p className="text-[13px] opacity-80">{contentCardMeta(card)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
