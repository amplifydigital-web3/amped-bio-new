import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbedFrame, embedTitle } from "./frame";

function youTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery) return fromQuery;
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last && /^[\w-]{6,}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

// Screen Review 040 I02, I07, I09: a 16:9 frame, caption under it.
export function YouTubeBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  const id = block.config.url ? youTubeId(block.config.url) : null;
  if (!id) return null;
  return (
    <EmbedFrame
      title={embedTitle("YouTube", block.config.content || block.config.label)}
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      aspect="16 / 9"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      caption={block.config.content}
      theme={theme}
    />
  );
}
