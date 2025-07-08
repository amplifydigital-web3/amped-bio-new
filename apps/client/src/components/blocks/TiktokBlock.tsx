import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@/api/api.types";
import { FaTiktok } from "react-icons/fa6";
import { TikTokEmbed } from "react-social-media-embed";

interface TiktokBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

export function TiktokBlock({ block, theme }: TiktokBlockProps) {
  if (!block.config.url) {
    return (
      <div className="w-full p-6 rounded-lg bg-black/10 border-2 border-dashed border-black/20 flex flex-col items-center justify-center space-y-2">
        <FaTiktok className="w-8 h-8 text-black" />
        <p className="text-sm text-black" style={{ fontFamily: theme.fontFamily }}>
          Add a TikTok video URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <FaTiktok className="w-4 h-4 text-black" />
        <span className="text-sm font-medium text-black" style={{ fontFamily: theme.fontFamily }}>
          TikTok
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <TikTokEmbed url={block.config.url} />
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
