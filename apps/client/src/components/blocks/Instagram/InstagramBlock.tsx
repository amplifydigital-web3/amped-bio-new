import { Instagram } from "lucide-react";
import type { ThemeConfig } from "../../../types/editor";
import { MediaBlock } from "@/api/api.types";
import { InstagramEmbed } from 'react-social-media-embed';

interface InstagramBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

export function InstagramBlock({ block, theme }: InstagramBlockProps) {
  if (!block.config.url) {
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
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <InstagramEmbed url={block.config.url} />
      </div>
      {/* Display content as description if available */}
      {block.config.content && block.config.content.trim() !== "" && (
        <div className="mt-2 px-3 py-2">
          <p className="text-sm text-gray-700" style={{ fontFamily: theme.fontFamily }}>
            {block.config.content}
          </p>
        </div>
      )}
    </div>
  );
}