import React from 'react';
import type { MediaBlock as MediaBlockType, Theme } from '../../types/editor';
import { SpotifyBlock } from './SpotifyBlock';
import { InstagramBlock } from './InstagramBlock';
import { YouTubeBlock } from './YouTubeBlock';
import { TwitterBlock } from './TwitterBlock';
import { TokenPriceBlock } from './TokenPriceBlock';
import { NFTCollectionBlock } from './NFTCollectionBlock';
import { UniswapBlock } from './UniswapBlock';
import { SubstackBlock } from './SubstackBlock';

interface MediaBlockProps {
  block: MediaBlockType;
  theme: Theme;
}

export function MediaBlock({ block, theme }: MediaBlockProps) {
  switch (block.mediaType) {
    case 'spotify':
      return <SpotifyBlock block={block} theme={theme} />;
    case 'instagram':
      return <InstagramBlock block={block} theme={theme} />;
    case 'youtube':
      return <YouTubeBlock block={block} theme={theme} />;
    case 'twitter':
      return <TwitterBlock block={block} theme={theme} />;
    case 'token-price':
      return <TokenPriceBlock block={block} theme={theme} />;
    case 'nft-collection':
      return <NFTCollectionBlock block={block} theme={theme} />;
    case 'uniswap':
      return <UniswapBlock block={block} theme={theme} />;
    case 'substack':
      return <SubstackBlock block={block} theme={theme} />;
    default:
      return null;
  }
}