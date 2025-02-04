import { Instagram } from 'lucide-react';
import type { MediaBlock as MediaBlockType, ThemeConfig } from '../../types/editor';

interface InstagramBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

export function InstagramBlock({ block, theme }: InstagramBlockProps) {
  if (!block.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#E4405F]/10 border-2 border-dashed border-[#E4405F]/20 flex flex-col items-center justify-center space-y-2">
        <Instagram className="w-8 h-8 text-[#E4405F]" />
        <p className="text-sm text-[#E4405F]" style={{ fontFamily: theme.fontFamily }}>
          Add an Instagram post URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Instagram className="w-4 h-4 text-[#E4405F]" />
        <span
          className="text-sm font-medium text-[#E4405F]"
          style={{ fontFamily: theme.fontFamily }}
        >
          Instagram
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg">
        <iframe
          src={`${block.content}/embed`}
          width="100%"
          height="400"
          frameBorder="0"
          scrolling="no"
          allowTransparency
          allow="encrypted-media"
          loading="lazy"
          className="w-full"
        />
      </div>
    </div>
  );
}