import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { InstagramEmbed } from "react-social-media-embed";
import { SelfSizingFrame, embedTitle } from "./frame";

// Screen Review 040 I02, I07, I09: no label row, 377 reserved, caption under it.
export function InstagramBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  if (!block.config.url) return null;
  return (
    <SelfSizingFrame
      title={embedTitle("Instagram", block.config.content || block.config.label)}
      caption={block.config.content}
      theme={theme}
    >
      <InstagramEmbed url={block.config.url} width="100%" />
    </SelfSizingFrame>
  );
}
