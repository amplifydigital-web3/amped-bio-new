import { z } from "zod";
import { allowedPlatforms, mediaPlataforms, PlatformId } from "./platforms";

// TypeScript type definitions for block types
type BaseBlockType = "link" | "media" | "text" | "pool";

export type BaseBlock<type extends BaseBlockType = any, T = any> = {
  id: number;
  user_id?: number;
  type: type;
  order: number;
  config: T;
  created_at?: string;
  updated_at?: string | null;
};

export type LinkBlock = BaseBlock<"link", { platform: PlatformId; url: string; label: string }>;

export type MediaBlockPlatform = (typeof mediaPlataforms)[number];

export type MediaBlock = BaseBlock<
  "media",
  {
    content?: string;
    platform: MediaBlockPlatform;
    url: string;
    label: string;
  }
>;

export type TextBlock = BaseBlock<
  "text",
  {
    content: string;
    platform: string;
  }
>;

export type PoolBlock = BaseBlock<
  "pool",
  {
    address: string;
    label: string;
  }
>;

export type BlockType = LinkBlock | MediaBlock | TextBlock | PoolBlock;

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

const poolConfigSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/, "Must be a valid blockchain address starting with 0x"),
  label: z.string().min(1, "Label is required"),
});

// Define allowed HTML tags
const allowedHtmlTags = ["p", "a", "span", "strong", "em", "u", "b", "i", "s"] as const;

const textConfigSchema = z.object({
  content: z
    .string()
    .min(0, "Content is required")
    .refine(
      html => {
        if (!html) return true;

        // Find all HTML tags in the string
        const tagRegex = /<\/?([a-zA-Z0-9]+)\b[^>]*>/gi;
        const allowed = new Set(allowedHtmlTags);

        for (const match of html.matchAll(tagRegex)) {
          const tagName = match[1]?.toLowerCase();
          if (!tagName || !allowed.has(tagName as (typeof allowedHtmlTags)[number])) {
            return false;
          }
        }
        return true;
      },
      {
        message: `HTML content can only contain the following tags: ${allowedHtmlTags.map(tag => `<${tag}>`).join(", ")}`,
      }
    )
    .refine(
      html => {
        // Block JavaScript in various forms
        const jsPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)[^<]*)*<\/script>/i, // <script> tags
          /javascript:/i, // javascript: protocol
          /on\w+\s*=/i, // event handlers like onclick=
          /eval\s*\(/i, // eval() calls
          /Function\s*\(/i, // Function constructor
          /\[\s*\[\s*\[\s*\[\s*\[\s*.*\]\s*\]\s*\]\s*\]\s*\]/i, // Obfuscated pattern with multiple brackets
        ];

        return !jsPatterns.some(pattern => pattern.test(html));
      },
      {
        message: "JavaScript content is not allowed in the HTML",
      }
    ),
});

// Schema for a single block
export const blockSchema = z.object({
  id: z.number(),
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  // Config is validated separately based on type
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema, poolConfigSchema]),
});

// Schema for editing multiple blocks
export const editBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});

// Schema for adding a new block - type specific validation
export const addBlockSchema = z.object({
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema, poolConfigSchema]),
});

// Schema for block id parameter
export const blockIdParamSchema = z.object({
  id: z.coerce.number({
    message: "Block ID must be a valid number",
  }),
});

// Define interfaces for API responses
export interface BlockResponse {
  message: string;
  result: {
    id: number;
    user_id: number;
    type: string;
    order: number;
    config: any;
    created_at: string;
    updated_at: string | null;
  };
}

export interface AddBlockData {
  type: BaseBlockType;
  order?: number;
  config: any;
}
