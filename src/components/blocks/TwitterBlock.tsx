import { FaXTwitter } from 'react-icons/fa6';
import type { MediaBlock as MediaBlockType, ThemeConfig } from '../../types/editor';

interface TwitterBlockProps {
  block: MediaBlockType;
  theme: ThemeConfig;
}

export function TwitterBlock({ block, theme }: TwitterBlockProps) {
  if (!block.content) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#1DA1F2]/10 border-2 border-dashed border-[#1DA1F2]/20 flex flex-col items-center justify-center space-y-2">
        <FaXTwitter className="w-8 h-8 text-[#1DA1F2]" />
        <p className="text-sm text-[#1DA1F2]" style={{ fontFamily: theme.fontFamily }}>
          Add a X post URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <FaXTwitter className="w-4 h-4 text-[#1DA1F2]" />
        <span
          className="text-sm font-medium text-[#1DA1F2]"
          style={{ fontFamily: theme.fontFamily }}
        >
          X
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden bg-white shadow-lg">
        <blockquote className="twitter-tweet" data-dnt="true">
          <a href={block.content}></a>
        </blockquote>
        <script async src="https://platform.x.com/widgets.js"></script>
      </div>
    </div>
  );
}