import { z } from "zod";

// Define allowed platforms
const allowedPlatforms = [
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

const mediaPlataforms = [
  "spotify",
  "instagram",
  "youtube",
  "twitter",
  "token-price",
  "nft-collection",
  "uniswap",
  "substack",
  "creator-pool",
] as const;

// Define configuration schemas for each block type
const linkConfigSchema = z.object({
  platform: z.enum(allowedPlatforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string().min(1, "Label is required"),
});

const mediaConfigSchema = z.object({
  platform: z.enum(mediaPlataforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string(),
  content: z.string().optional(),
});

const textConfigSchema = z.object({
  // platform: z.string(),
  content: z.string()
    .min(0, "Content is required")
    .refine(
      (html) => {
        // Skip validation if empty
        if (!html) return true;
        
        // Simple regex to validate HTML containing only allowed tags
        // This checks that all opening tags are either p, a, or span
        const allowedTagsRegex = /<(?!\/?(p|a|span|strong|em|u|b|i|s)\b)[^>]+>/i;
        
        // If the regex matches any non-allowed tags, validation fails
        return !allowedTagsRegex.test(html);
      },
      {
        message: "HTML content can only contain paragraph (<p>), anchor (<a>), and span (<span>) tags"
      }
    ),
});

// Schema for a single block
export const blockSchema = z.object({
  id: z.number(),
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  // Config is validated separately based on type
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema]),
});

// Schema for editing multiple blocks
export const editBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});

// Schema for adding a new block - type specific validation
export const addBlockSchema = z.object({
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema]),
});

// Schema for block id parameter
export const blockIdParamSchema = z.object({
  id: z.string().refine(val => !isNaN(Number(val)), {
    message: "Block ID must be a valid number",
  }),
});

export type PlatformId = (typeof allowedPlatforms)[number];
export type MediaPlatformId = (typeof mediaPlataforms)[number];
export type Block = z.infer<typeof blockSchema>;
export type EditBlocksInput = z.infer<typeof editBlocksSchema>;
export type AddBlockInput = z.infer<typeof addBlockSchema>;
export type BlockIdParam = z.infer<typeof blockIdParamSchema>;
