import { z } from "zod";
import { allowedPlatforms, mediaPlataforms } from "@ampedbio/constants";

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

// Define allowed HTML tags
const allowedHtmlTags = [
  "p",
  "a",
  "span",
  "strong",
  "em",
  "u",
  "b",
  "i",
  "s",
] as const;

const textConfigSchema = z.object({
  content: z.string()
    .min(0, "Content is required")
    .refine(
      (html) => {
        // Skip validation if empty
        if (!html) return true;
        
        // Build regex pattern from allowed tags array
        const tagPattern = allowedHtmlTags.join("|");
        const allowedTagsRegex = new RegExp(`<(?!\/?(${tagPattern})\\b)[^>]+>`, "i");
        
        // If the regex matches any non-allowed tags, validation fails
        return !allowedTagsRegex.test(html);
      },
      {
        message: `HTML content can only contain the following tags: ${allowedHtmlTags.map(tag => `<${tag}>`).join(", ")}`
      }
    )
    .refine(
      (html) => {
        // Block JavaScript in various forms
        const jsPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i, // <script> tags
          /javascript:/i, // javascript: protocol
          /on\w+\s*=/i, // event handlers like onclick=
          /eval\s*\(/i, // eval() calls
          /Function\s*\(/i, // Function constructor
          /\[\s*\[\s*\[\s*\[\s*\[\s*.*\]\s*\]\s*\]\s*\]\s*\]/i, // Obfuscated pattern with multiple brackets
        ];
        
        return !jsPatterns.some(pattern => pattern.test(html));
      },
      {
        message: "JavaScript content is not allowed in the HTML"
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
