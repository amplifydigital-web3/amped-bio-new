"use client";

import type { ThemeConfig } from "@repo/constants";
import { MediaBlock } from "@repo/constants";
import { EmbeddedTweet } from "react-tweet";
import { Caption, EmbedSkeleton, embedTitle } from "./frame";
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
function normalizeTweetEntities(entities?: TweetEntities | null): TweetEntities {
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

/** Container luminance picks react-tweet's light or dark theme (040 I07). */
function tweetTheme(theme: ThemeConfig): "light" | "dark" {
  const hex = (theme.containerColor || theme.buttonColor || "#ffffff").replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map(c => c + c)
          .join("")
      : hex.slice(0, 6);
  const value = parseInt(full, 16);
  if (Number.isNaN(value)) return "light";
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4 ? "dark" : "light";
}

// Screen Review 040 I01, I02, I07, I09: no label row and no visitor facing
// error text. An invalid link, a deleted post or a failed load renders nothing;
// while loading, a 377 skeleton holds the space.
export function TwitterBlock({ block, theme }: TwitterBlockProps) {
  const tweetId = (block.config.url ? extractTweetId(block.config.url) : null) ?? undefined;
  const { data, isLoading } = useTweet(tweetId);
  const tweet = useMemo(() => (data ? normalizeTweet(data) : null), [data]);

  if (!tweetId) return null;
  if (!isLoading && !tweet) return null;

  return (
    <figure className="w-full">
      <div
        role="group"
        aria-label={embedTitle("X", block.config.content || block.config.label)}
        data-theme={tweetTheme(theme)}
        className="relative w-full overflow-hidden rounded-prism-13 [&_.react-tweet-theme]:!m-0 [&_.react-tweet-theme]:!max-w-none"
        style={isLoading ? { minHeight: 377 } : undefined}
      >
        {isLoading ? <EmbedSkeleton /> : tweet ? <EmbeddedTweet tweet={tweet} /> : null}
      </div>
      <Caption text={block.config.content} theme={theme} />
    </figure>
  );
}
