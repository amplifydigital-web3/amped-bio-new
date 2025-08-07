import { FaXTwitter } from "react-icons/fa6";
import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@ampedbio/constants";
import { Tweet as ReactTweet } from "react-tweet";

interface TwitterBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

// Function to extract tweet ID from X.com or Twitter URL
function extractTweetId(url: string): string | null {
  try {
    // Match the pattern for both x.com and twitter.com URLs
    const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function TwitterBlock({ block, theme }: TwitterBlockProps) {
  if (!block.config.url) {
    return (
      <div className="w-full p-6 rounded-lg bg-[#1DA1F2]/10 border-2 border-dashed border-[#1DA1F2]/20 flex flex-col items-center justify-center space-y-2">
        <FaXTwitter className="w-8 h-8 text-[#1DA1F2]" />
        <p className="text-sm text-[#1DA1F2]" style={{ fontFamily: theme.fontFamily }}>
          Add a X post URL
        </p>
      </div>
    );
  }

  // Extract the tweet ID from the URL
  const tweetId = block.config.url ? extractTweetId(block.config.url) : null;

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
      {tweetId ? (
        <ReactTweet id={tweetId} />
      ) : (
        <div className="w-full p-4 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 text-center">
          <p className="text-sm text-[#1DA1F2]" style={{ fontFamily: theme.fontFamily }}>
            Invalid tweet URL. Please update with a valid X post link.
          </p>
        </div>
      )}
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
