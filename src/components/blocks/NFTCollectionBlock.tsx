import { Store } from 'lucide-react';
import type { MediaBlock as MediaBlockType, ThemeConfig } from '../../types/editor';

interface NFTCollectionBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

export function NFTCollectionBlock({ block, theme }: NFTCollectionBlockProps) {
  if (!block.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#2081E2]/10 border-2 border-dashed border-[#2081E2]/20 flex flex-col items-center justify-center space-y-2">
        <Store className="w-8 h-8 text-[#2081E2]" />
        <p className="text-sm text-[#2081E2]" style={{ fontFamily: theme.fontFamily }}>
          Add an OpenSea collection URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Store className="w-4 h-4 text-[#2081E2]" />
        <span
          className="text-sm font-medium text-[#2081E2]"
          style={{ fontFamily: theme.fontFamily }}
        >
          NFT Collection
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg">
        <iframe
          src={`${block.content}/embed`}
          width="100%"
          height="400"
          frameBorder="0"
          allowTransparency
          allow="encrypted-media"
          loading="lazy"
          className="w-full"
        />
      </div>
    </div>
  );
}