import { z } from "zod";
import { allowedPlatforms, mediaPlataforms, PlatformId } from "./platforms";

// TypeScript type definitions for block types
type BaseBlockType =
  | "link"
  | "media"
  | "text"
  | "pool"
  | "referral"
  | "follow"
  | "followers"
  | "rnsid";

export type BaseBlock<type extends BaseBlockType = any, T = any> = {
  id: number;
  user_id?: number;
  type: type;
  order: number;
  /** `hidden` keeps a block off the page without deleting it (Screen Review 036 I09) */
  config: T & { hidden?: boolean };
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

export type ReferralBlock = BaseBlock<"referral", {}>;

// Fan Graph phase 1c (Build Board #30): a Follow button in the page flow and a
// Followers social proof card. Spec: docs/features/follow-blocks.md. Both are
// singletons, like the referral block.
export type FollowBlock = BaseBlock<"follow", { label: string }>;

export type FollowersGrowthRange = "7d" | "30d";
export type FollowersFacesOrder = "newest" | "longest" | "poolFans";
export type FollowersFacesMax = 6 | 12;

export type FollowersBlockConfig = {
  /** Card title, 1 to 40 characters */
  title: string;
  show: {
    /** Count and growth line. Hidden under 10 followers and while the count is hidden */
    count: boolean;
    /** Followers who chose to appear on public lists */
    faces: boolean;
    /** Followers who also stake in the creator's pool */
    poolFans: boolean;
    milestone: boolean;
    /** Where followers come from, kinds only */
    sources: boolean;
  };
  growthRange: FollowersGrowthRange;
  facesOrder: FollowersFacesOrder;
  facesMax: FollowersFacesMax;
  /** A Follow button inside the card */
  followButton: boolean;
};

export type FollowersBlock = BaseBlock<"followers", FollowersBlockConfig>;

// RNS ID block (Build Board #33, Screen Review 112): who runs the page, from
// the same server identity rule as the header chip (108, 109). One per page.
// The block never carries identity data; the public renderer reads
// `profile.identity`, so the owner's Page > RNS switches and the binding
// rule apply before anything reaches a visitor.
export type RnsIdBlockStyle = "nameplate" | "idcard" | "proofstrip" | "seal";
export type RnsIdBlockTap = "sheet" | "inline" | "none";

export type RnsIdBlockConfig = {
  style: RnsIdBlockStyle;
  /** Eyebrow on ID Card and Proof Strip, 1 to 24 characters */
  label: string;
  /** sheet: the identity sheet. inline: the facts open under the block. none: static */
  tap: RnsIdBlockTap;
  show: {
    /** Display name and handle (ID Card, Seal sentence) */
    displayName: boolean;
    /** Avatar (ID Card) */
    avatar: boolean;
    /** Month the page joined Amped.Bio */
    since: boolean;
    /** The name Authbase checked. Verified pages only, server applied (112 D1) */
    nameOnId: boolean;
  };
};

export type RnsIdBlock = BaseBlock<"rnsid", RnsIdBlockConfig>;

export const RNSID_LABEL_MAX = 24;

export const DEFAULT_RNSID_CONFIG: RnsIdBlockConfig = {
  style: "nameplate",
  label: "Identity",
  tap: "sheet",
  show: { displayName: true, avatar: true, since: true, nameOnId: false },
};

/** Which tap behaviours a style offers (112 D3) */
export function rnsIdTapsFor(style: RnsIdBlockStyle): readonly RnsIdBlockTap[] {
  return style === "idcard" || style === "proofstrip" ? ["sheet", "inline"] : ["sheet", "none"];
}

export const FOLLOW_LABEL_MAX = 24;
export const FOLLOWERS_TITLE_MAX = 40;

export const DEFAULT_FOLLOW_CONFIG: FollowBlock["config"] = { label: "Follow" };

export const DEFAULT_FOLLOWERS_CONFIG: FollowersBlockConfig = {
  title: "Followers",
  show: { count: true, faces: true, poolFans: true, milestone: true, sources: false },
  growthRange: "7d",
  facesOrder: "newest",
  facesMax: 6,
  followButton: true,
};

export type BlockType =
  | LinkBlock
  | MediaBlock
  | TextBlock
  | PoolBlock
  | ReferralBlock
  | FollowBlock
  | FollowersBlock
  | RnsIdBlock;

/** Block types a page holds at most once. The Add block dialog opens the existing row. */
export const SINGLETON_BLOCK_TYPES = ["referral", "follow", "followers", "rnsid"] as const;

/**
 * Capsule rule (follow-blocks spec 3.8): a renderable block that carries its
 * own Follow button takes Follow and the count out of the Amped frame capsule,
 * so one Follow is on screen at a time.
 */
export function blockCarriesFollow(block: BlockType): boolean {
  if ((block.config as { hidden?: boolean }).hidden) return false;
  if (block.type === "follow") return true;
  return block.type === "followers" && block.config.followButton !== false;
}

// Define configuration schemas for each block type
export const linkConfigSchema = z.object({
  platform: z.enum(allowedPlatforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string().min(1, "Label is required"),
  hidden: z.boolean().optional(),
});

export const mediaConfigSchema = z.object({
  platform: z.enum(mediaPlataforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string(),
  content: z.string().optional(),
  hidden: z.boolean().optional(),
});

export const poolConfigSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]+$/, "Must be a valid blockchain address starting with 0x"),
  label: z.string().min(1, "Label is required"),
  hidden: z.boolean().optional(),
});

// Define allowed HTML tags
const allowedHtmlTags = ["p", "a", "span", "strong", "em", "u", "b", "i", "s"] as const;

export const textConfigSchema = z.object({
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
  hidden: z.boolean().optional(),
});

export const referralConfigSchema = z.object({ hidden: z.boolean().optional() });

export const followConfigSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(FOLLOW_LABEL_MAX),
  hidden: z.boolean().optional(),
});

export const followersConfigSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(FOLLOWERS_TITLE_MAX),
  show: z.object({
    count: z.boolean().default(true),
    faces: z.boolean().default(true),
    poolFans: z.boolean().default(true),
    milestone: z.boolean().default(true),
    sources: z.boolean().default(false),
  }),
  growthRange: z.enum(["7d", "30d"]).default("7d"),
  facesOrder: z.enum(["newest", "longest", "poolFans"]).default("newest"),
  facesMax: z.union([z.literal(6), z.literal(12)]).default(6),
  followButton: z.boolean().default(true),
  hidden: z.boolean().optional(),
});

export const rnsIdConfigSchema = z.object({
  style: z.enum(["nameplate", "idcard", "proofstrip", "seal"]).default("nameplate"),
  label: z.string().trim().min(1, "Label is required").max(RNSID_LABEL_MAX).default("Identity"),
  tap: z.enum(["sheet", "inline", "none"]).default("sheet"),
  show: z
    .object({
      displayName: z.boolean().default(true),
      avatar: z.boolean().default(true),
      since: z.boolean().default(true),
      nameOnId: z.boolean().default(false),
    })
    .default({ displayName: true, avatar: true, since: true, nameOnId: false }),
  hidden: z.boolean().optional(),
});

/** The config schema for a block type. Unknown types fall back to the union. */
const CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  link: linkConfigSchema,
  media: mediaConfigSchema,
  text: textConfigSchema,
  pool: poolConfigSchema,
  referral: referralConfigSchema,
  follow: followConfigSchema,
  followers: followersConfigSchema,
  rnsid: rnsIdConfigSchema,
};

// The referral schema accepts any object, so it stays last in the fallback
const anyBlockConfigSchema = z.union([
  linkConfigSchema,
  mediaConfigSchema,
  textConfigSchema,
  poolConfigSchema,
  followConfigSchema,
  followersConfigSchema,
  rnsIdConfigSchema,
  referralConfigSchema,
]);

export function blockConfigSchemaFor(type: string): z.ZodTypeAny {
  return CONFIG_SCHEMAS[type] ?? anyBlockConfigSchema;
}

/**
 * Validates `config` with the schema its `type` names, so a link with a bad
 * URL is refused instead of parsing as another block's config.
 */
function refineTypedConfig(
  block: { type: string; config: Record<string, unknown> },
  ctx: z.RefinementCtx
) {
  const result = blockConfigSchemaFor(block.type).safeParse(block.config);
  if (result.success) return;
  for (const issue of result.error.issues) {
    ctx.addIssue({ ...issue, path: ["config", ...issue.path] });
  }
}

function parseTypedConfig<T extends { type: string; config: Record<string, unknown> }>(block: T) {
  return {
    ...block,
    config: blockConfigSchemaFor(block.type).parse(block.config) as BlockType["config"],
  };
}

const blockTypeField = z.string().min(1, "Block type is required");
const rawConfigField = z.record(z.string(), z.unknown());

// Schema for a single block
export const blockSchema = z
  .object({
    id: z.number(),
    type: blockTypeField,
    order: z.number().default(0),
    config: rawConfigField,
  })
  .superRefine(refineTypedConfig)
  .transform(parseTypedConfig);

// Schema for editing multiple blocks
export const editBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});

// Schema for adding a new block - type specific validation
export const addBlockSchema = z
  .object({ type: blockTypeField, order: z.number().default(0), config: rawConfigField })
  .superRefine(refineTypedConfig)
  .transform(parseTypedConfig);

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
