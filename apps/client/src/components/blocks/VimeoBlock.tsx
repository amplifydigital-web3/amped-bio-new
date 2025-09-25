import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@ampedbio/constants";
import { FaVimeo } from "react-icons/fa6";

interface VimeoBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

function isValidVimeoUrl(url: string): boolean {
  const vimeoRegex = /^(https?:\/\/)?(www\.)?vimeo\.com\/(\d+)(\/[a-zA-Z0-9_-]*)?$/;
  return vimeoRegex.test(url);
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)(\/[a-zA-Z0-9_-]*)?/);
  return match ? match[1] : null;
}

export function VimeoBlock({ block, theme }: VimeoBlockProps) {
  if (!block.config.url) {
    return (
      <div className="w-full p-6 rounded-lg bg-black/10 border-2 border-dashed border-black/20 flex flex-col items-center justify-center space-y-2">
        <FaVimeo className="w-8 h-8 text-black" />
        <p className="text-sm text-black" style={{ fontFamily: theme.fontFamily }}>
          Add a Vimeo video URL
        </p>
      </div>
    );
  }

  if (!isValidVimeoUrl(block.config.url)) {
    return (
      <div className="w-full p-6 rounded-lg bg-red-100 border-2 border-dashed border-red-300 flex flex-col items-center justify-center space-y-2">
        <FaVimeo className="w-8 h-8 text-red-500" />
        <p className="text-sm text-red-500" style={{ fontFamily: theme.fontFamily }}>
          Invalid Vimeo URL
        </p>
      </div>
    );
  }

  const vimeoId = getVimeoId(block.config.url);

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center space-x-2 px-3">
        <FaVimeo className="w-4 h-4 text-black" />
        <span className="text-sm font-medium text-black" style={{ fontFamily: theme.fontFamily }}>
          Vimeo
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        {vimeoId && (
          <iframe
            src={`https://player.vimeo.com/video/${vimeoId}`}
            width="640"
            height="360"
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="Vimeo video player"
            className="w-full max-w-full"
            style={{ aspectRatio: "16/9" }}
          />
        )}
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
