import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbedFrame, embedTitle } from "./frame";

// Screen Review 040 I02, I07: no label row; a fixed 320 frame.
export function SubstackBlock({ block, theme }: { block: MediaBlock; theme: ThemeConfig }) {
  if (!block.config.content || !/^https:\/\//.test(block.config.content)) return null;
  return (
    <EmbedFrame
      title={embedTitle("Substack", block.config.label)}
      src={`${block.config.content}/embed`}
      height={320}
      scrolling="no"
      theme={theme}
    />
  );
}
