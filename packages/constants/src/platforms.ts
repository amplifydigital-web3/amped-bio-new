// Constants for platforms used in both client and server

export const allowedPlatforms = [
  "twitter",
  "telegram",
  "discord",
  "instagram",
  "lens",
  "facebook",
  "tiktok",
  "element",
  "github",
  "linkedin",
  "medium",
  "mirror",
  "warpcast",
  "zora",
  "opensea",
  "youtube",
  "patreon",
  "onlyfans",
  "appstore",
  "playstore",
  "email",
  "document",
  "custom",
] as const;

export const mediaPlataforms = [
  "spotify",
  "instagram",
  "youtube",
  "twitter",
  "token-price",
  "nft-collection",
  "uniswap",
  "substack",
  "creator-pool",
  "facebook",
  "tiktok",
  "discord",
  "twitch",
] as const;

export type PlatformId = (typeof allowedPlatforms)[number];
