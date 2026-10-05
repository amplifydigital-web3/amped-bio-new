import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbedFrame, embedTitle } from "./frame";

function vimeoId(url: string): string | null {
  const match = url.match(/^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)(?:\/[\w-]*)?$/);
  return match ? match[1] : null;
}

// Screen Review 040 I02, I07, I09: a 16:9 frame, caption under it.
export function VimeoBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  const id = block.config.url ? vimeoId(block.config.url) : null;
  if (!id) return null;
  return (
    <EmbedFrame
      title={embedTitle("Vimeo", block.config.content || block.config.label)}
      src={`https://player.vimeo.com/video/${id}`}
      aspect="16 / 9"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      caption={block.config.content}
      theme={theme}
    />
  );
}
