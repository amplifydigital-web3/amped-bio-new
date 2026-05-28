"use client";

import { FaXTwitter } from "react-icons/fa6";
import type { ThemeConfig } from "../../types/editor";
import { MediaBlock } from "@ampedbio/constants";
import { EmbeddedTweet, TweetSkeleton } from "react-tweet";
import { useTweet } from "react-tweet";
import type { Tweet, TweetEntities } from "react-tweet/api";
import { useMemo } from "react";

interface TwitterBlockProps {
  block: MediaBlock;
  theme: ThemeConfig;
}

function extractTweetId(url: string): string | null {
  try {
    const match = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Workaround for react-tweet issue where the Twitter Syndication API sometimes
 * omits entity arrays, causing enrichTweet to crash.
 * @see https://github.com/vercel/react-tweet/issues/218#issuecomment-4521112920
 */
function asEntityArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Ensures all entity arrays are present and properly typed before enrichment.
 * @see https://github.com/vercel/react-tweet/issues/218#issuecomment-4521112920
 */
function normalizeTweetEntities(
  entities?: TweetEntities | null,
): TweetEntities {
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) {
    return {
      hashtags: [],
      user_mentions: [],
      urls: [],
      symbols: [],
    };
  }

  const normalized: TweetEntities = {
    hashtags: asEntityArray(entities.hashtags),
    user_mentions: asEntityArray(entities.user_mentions),
    urls: asEntityArray(entities.urls),
    symbols: asEntityArray(entities.symbols),
  };

  const media = asEntityArray(entities.media);
  if (media.length > 0) {
    normalized.media = media;
  }

  return normalized;
}

/**
 * Normalizes a tweet and its nested entities (quoted_tweet, parent) to prevent
 * crashes when the Syndication API returns incomplete entity data.
 * @see https://github.com/vercel/react-tweet/issues/218#issuecomment-4521112920
 */
function normalizeTweet(tweet: Tweet): Tweet {
  return {
    ...tweet,
    entities: normalizeTweetEntities(tweet.entities),
    ...(tweet.quoted_tweet
      ? {
          quoted_tweet: {
            ...tweet.quoted_tweet,
            entities: normalizeTweetEntities(tweet.quoted_tweet.entities),
          },
        }
      : {}),
    ...(tweet.parent
      ? {
          parent: {
            ...tweet.parent,
            entities: normalizeTweetEntities(tweet.parent.entities),
          },
        }
      : {}),
  };
}

export function TwitterBlock({ block, theme }: TwitterBlockProps) {
  const extractedId = block.config.url ? extractTweetId(block.config.url) : null;
  const tweetId = extractedId ?? undefined;

  const { data, isLoading, error } = useTweet(tweetId);

  const tweet = useMemo(
    () => (data ? normalizeTweet(data) : null),
    [data],
  );

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
      {!tweetId ? (
        <div className="w-full p-4 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 text-center">
          <p className="text-sm text-[#1DA1F2]" style={{ fontFamily: theme.fontFamily }}>
            Invalid tweet URL. Please update with a valid X post link.
          </p>
        </div>
      ) : isLoading ? (
        <TweetSkeleton />
      ) : tweet ? (
        <EmbeddedTweet tweet={tweet} />
      ) : (
        <div className="w-full p-4 rounded-lg bg-[#1DA1F2]/10 border border-[#1DA1F2]/20 text-center">
          <p className="text-sm text-[#1DA1F2]" style={{ fontFamily: theme.fontFamily }}>
            {error ? "Failed to load tweet." : "Tweet not found."}
          </p>
        </div>
      )}
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
