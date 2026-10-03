import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { TikTokEmbed } from "react-social-media-embed";
import { SelfSizingFrame, embedTitle } from "./frame";

// Screen Review 040 I02, I07, I09: no label row; 9:16 capped at 610 high.
export function TiktokBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  if (!block.config.url) return null;
  return (
    <SelfSizingFrame
      title={embedTitle("TikTok", block.config.content || block.config.label)}
      caption={block.config.content}
      theme={theme}
    >
      <div className="max-h-[610px] w-full overflow-hidden">
        <TikTokEmbed url={block.config.url} width="100%" />
      </div>
    </SelfSizingFrame>
  );
}
