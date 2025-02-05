import { Newspaper } from 'lucide-react';
import type { MediaBlock as MediaBlockType, ThemeConfig } from '../../types/editor';

interface SubstackBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

export function SubstackBlock({ block, theme }: SubstackBlockProps) {
  if (!block.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#FF6719]/10 border-2 border-dashed border-[#FF6719]/20 flex flex-col items-center justify-center space-y-2">
        <Newspaper className="w-8 h-8 text-[#FF6719]" />
        <p className="text-sm text-[#FF6719]" style={{ fontFamily: theme.fontFamily }}>
          Add your Substack URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Newspaper className="w-4 h-4 text-[#FF6719]" />
        <span
          className="text-sm font-medium text-[#FF6719]"
          style={{ fontFamily: theme.fontFamily }}
        >
          Substack
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg">
        <iframe
          src={`${block.content}/embed`}
          width="100%"
          height="320"
          frameBorder="0"
          scrolling="no"
          className="w-full"
        />
      </div>
    </div>
  );
}