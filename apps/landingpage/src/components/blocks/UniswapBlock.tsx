import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbedFrame, embedTitle } from "./frame";

// Screen Review 040 I02, I07: no label row; a fixed 400 frame.
export function UniswapBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  if (!block.config.content || !/^https:\/\//.test(block.config.content)) return null;
  return (
    <EmbedFrame
      title={embedTitle("Uniswap", block.config.label)}
      src={block.config.content}
      height={400}
      allow="encrypted-media"
      theme={theme}
    />
  );
}
