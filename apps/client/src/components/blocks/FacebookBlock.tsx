import { Facebook } from "lucide-react";
import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@ampedbio/constants";
import { FacebookEmbed } from "react-social-media-embed";

interface FacebookBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

export function FacebookBlock({ block, theme }: FacebookBlockProps) {
  if (!block.config.url) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#1877F2]/10 border-2 border-dashed border-[#1877F2]/20 flex flex-col items-center justify-center space-y-2">
        <Facebook className="w-8 h-8 text-[#1877F2]" />
        <p className="text-sm text-[#1877F2]" style={{ fontFamily: theme.fontFamily }}>
          Add a Facebook post URL
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <Facebook className="w-4 h-4 text-[#1877F2]" />
        <span
          className="text-sm font-medium text-[#1877F2]"
          style={{ fontFamily: theme.fontFamily }}
        >
          Facebook
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <FacebookEmbed url={block.config.url} width="100%" />
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
