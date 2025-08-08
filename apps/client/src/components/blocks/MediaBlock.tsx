import type { ThemeConfig } from "../../types/editor";
import { SpotifyBlock } from "./SpotifyBlock";
import { InstagramBlock } from "./InstagramBlock";
import { YouTubeBlock } from "./YouTubeBlock";
import { TwitterBlock } from "./TwitterBlock";
import { TokenPriceBlock } from "./TokenPriceBlock";
import { NFTCollectionBlock } from "./NFTCollectionBlock";
import { UniswapBlock } from "./UniswapBlock";
import { SubstackBlock } from "./SubstackBlock";
import { CreatorPoolBlock } from "./CreatorPoolBlock";
import { MediaBlock as MediaBlockType } from "@ampedbio/constants";
import { FacebookBlock } from "./FacebookBlock";
import { TiktokBlock } from "./TiktokBlock";

interface MediaBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

export function MediaBlock({ block, theme }: MediaBlockProps) {
  switch (block.config.platform) {
    case "spotify":
      return <SpotifyBlock block={block} theme={theme} />;
    case "instagram":
      return <InstagramBlock block={block} theme={theme} />;
    case "youtube":
      return <YouTubeBlock block={block} theme={theme} />;
    case "twitter":
      return <TwitterBlock block={block} theme={theme} />;
    case "token-price":
      return <TokenPriceBlock block={block} theme={theme} />;
    case "nft-collection":
      return <NFTCollectionBlock block={block} theme={theme} />;
    case "uniswap":
      return <UniswapBlock block={block} theme={theme} />;
    case "substack":
      return <SubstackBlock block={block} theme={theme} />;
    case "creator-pool":
      return <CreatorPoolBlock block={block} theme={theme} />;
    case "facebook":
      return <FacebookBlock block={block} theme={theme} />;
    case "tiktok":
      return <TiktokBlock block={block} theme={theme} />;
    default:
      return null;
  }
}
