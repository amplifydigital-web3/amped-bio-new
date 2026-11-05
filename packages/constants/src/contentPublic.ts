/**
 * Public content: cards, the item page, the feed, reports, publishing and retry
 * (Build Board #20, spec 3.7 and 3.10, PR 6). Shared by the API and both apps.
 *
 * Public outputs carry no email, wallet or numeric user id (acceptance 19), and
 * no media URL beyond covers for public items: playback URLs come from
 * content.getReadUrl in the browser, never in server HTML.
 */
import { z } from "zod";
import { HANDLE_REGEX } from "./handle";
import { CONTENT_UPLOAD_KINDS, contentAccessInputSchema, contentPublicIdSchema } from "./content";
import type { ContentImageSet } from "./contentPlayer";
import { ACCESS_RESOURCE_TYPES, type AccessDecision, type AccessRuleKind } from "./access";

/** "@Maya.Lin" and "maya.lin" are the same page. */
export const contentHandleSchema = z
  .string()
  .trim()
  .transform(value => (value.startsWith("@") ? value.slice(1) : value).toLowerCase())
  .pipe(z.string().min(1).max(64).regex(HANDLE_REGEX));

export const contentListForBioSchema = z.object({
  handle: contentHandleSchema,
  publicIds: z.array(contentPublicIdSchema).min(1).max(12),
});

export const CONTENT_FEED_PAGE = 24;

export const contentFeedSchema = z.object({
  handle: contentHandleSchema,
  kind: z.enum(CONTENT_UPLOAD_KINDS).optional(),
  /** publicId of the last item on the previous page */
  cursor: contentPublicIdSchema.optional(),
  limit: z.number().int().min(1).max(48).default(CONTENT_FEED_PAGE),
});

export const contentPublicItemSchema = z.object({
  handle: contentHandleSchema,
  publicId: contentPublicIdSchema,
});

/**
 * Report reasons, as ContentReport.reason stores them, in the order fans see them
 * (adult content review 7.1, R3; `csam` keeps its value). `store_policy` is offered
 * on store pages only.
 */
export const CONTENT_REPORT_REASONS = [
  "ncii",
  "withdraw",
  "csam",
  "adult",
  "copyright",
  "harassment",
  "scam",
  "malware",
  "other",
  "store_policy",
] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

/** Reasons on an item's Report sheet (store pages add `store_policy`). */
export const CONTENT_ITEM_REPORT_REASONS = CONTENT_REPORT_REASONS.filter(
  reason => reason !== "store_policy"
) as Exclude<ContentReportReason, "store_policy">[];

export const CONTENT_REPORT_LABELS: Record<ContentReportReason, string> = {
  ncii: "This is me and I did not agree",
  withdraw: "I appear in this and withdraw consent",
  csam: "This shows a child",
  adult: "Adult item not labeled",
  copyright: "It copies my work",
  harassment: "Harassment",
  scam: "Scam or fraud",
  malware: "The file is harmful",
  other: "Something else",
  store_policy: "Store policy breaks the rules",
};

/** Reasons that continue on a public notice form instead of a report (7.1, 7.5). */
export const CONTENT_REPORT_FORM: Partial<Record<ContentReportReason, "takedown" | "copyright">> = {
  ncii: "takedown",
  withdraw: "takedown",
  copyright: "copyright",
};

export const contentReportSchema = z.object({
  publicId: contentPublicIdSchema,
  reason: z.enum(CONTENT_REPORT_REASONS),
  details: z.string().trim().max(2000).optional(),
});

/** Retry a failed item. A file is needed when the upload is no longer kept. */
export const contentRetrySchema = z.object({
  publicId: contentPublicIdSchema,
  file: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(100),
      size: z.number().int().positive(),
      durationSec: z.number().positive().optional(),
    })
    .optional(),
});

/** Restorable for this long after delete (spec 3.12). */
export const CONTENT_RESTORE_DAYS = 30;

/** A card on a bio block, the feed or a library. */
export interface ContentCard {
  publicId: string;
  kind: "video" | "audio" | "image" | "document" | "file";
  title: string;
  durationMs: number | null;
  pageCount: number | null;
  /** ISO time of the first publish */
  publishedAt: string | null;
  cover: ContentImageSet | null;
  /** 32 px blur cover, for a placeholder while the cover loads */
  blur: string | null;
  allowDownload: boolean;
  /**
   * Set when the item has an access rule (content gating spec 3.2). A locked
   * card carries no cover, only the blur, and never a media token, rendition,
   * poster, waveform, description or stake amount.
   */
  gate?: ContentGate | null;
}

/** The public face of an item's rule: its kind and summary, never its params. */
export interface ContentGate {
  kind: AccessRuleKind;
  summary: string;
  /** True when the rule reads a stake: the unlock card shows TESTNET_NOTICE and ACCESS_STAKE_DISCLOSURE */
  stake: boolean;
  /** The creator's pool page for Go to the pool. Public already; never an amount. */
  poolAddress?: string | null;
}

/** The item page's server data (spec 3.7). No playback URLs. A locked item has no description, chapters or captions. */
export interface ContentPublicItem extends ContentCard {
  description: string | null;
  chapters: Array<{ startMs: number; title: string }>;
  captionLangs: string[];
  /** Documents only: pdf opens in the in app viewer, epub downloads */
  documentFormat: "pdf" | "epub" | null;
  creator: { handle: string; name: string | null; image: string | null };
}

/** The feed page (spec 3.7, board cs6). */
export interface ContentFeedPage {
  creator: { handle: string; name: string | null; image: string | null };
  items: ContentCard[];
  nextCursor: string | null;
}

/** "Video, 12:40", "PDF, 18 pages", "Image": the line under a card title. */
export function contentCardMeta(card: Pick<ContentCard, "kind" | "durationMs" | "pageCount">) {
  const clock = (ms: number) => {
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  };
  switch (card.kind) {
    case "video":
      return card.durationMs ? `Video, ${clock(card.durationMs)}` : "Video";
    case "audio":
      return card.durationMs ? `Audio, ${clock(card.durationMs)}` : "Audio";
    case "document":
      return card.pageCount
        ? `PDF, ${card.pageCount} ${card.pageCount === 1 ? "page" : "pages"}`
        : "Document";
    case "image":
      return "Image";
    case "file":
      return "Download, ZIP";
  }
}

// ----------------------------------------------------------------------------
// Content gating (docs/features/content-gating.md, PR C8)
// ----------------------------------------------------------------------------

/** content.getPreview: what a locked fan may see. Never the full asset. */
export const contentPreviewSchema = z.object({ publicId: contentPublicIdSchema });

export interface ContentPreview {
  publicId: string;
  kind: ContentCard["kind"];
  blur: string | null;
  /** The PREVIEW_CLIP (video), through a signed Stream token */
  clip: { hls: string; dash: string } | null;
  /** AUDIO_PREVIEW gateway URL */
  audio: string | null;
  /** PAGE_PREVIEW gateway URLs (documents), in page order */
  pages: string[];
  /** Unix ms when the earliest URL expires (1 hour, content spec 3.6) */
  expiresAt: number;
  /** The render decision: available and 18+ only, not the rule */
  decision: AccessDecision;
}

/** Cards checked in one call (spec 3.4). */
export const ACCESS_CHECK_PAGE_MAX = 48;

export const accessCheckPageSchema = z.object({
  handle: contentHandleSchema,
  resources: z
    .array(
      z.object({
        type: z.enum(ACCESS_RESOURCE_TYPES),
        id: z.string().min(1).max(64),
      })
    )
    .min(1)
    .max(ACCESS_CHECK_PAGE_MAX),
});

/** blocks.setAccessRule: Everyone (null), a saved rule or an inline rule (G3). */
export const blockSetAccessSchema = z.object({
  blockId: z.number().int().positive(),
  access: contentAccessInputSchema.nullable(),
});

export const blockOpenSchema = z.object({ blockId: z.number().int().positive() });

/** What access.openBlock reveals on a pass: the block's own config. */
export type BlockReveal =
  | { kind: "link"; url: string; label: string; platform: string }
  | { kind: "text"; content: string; platform: string }
  | { kind: "media"; url: string; label: string; platform: string; content?: string };

/** checkPage answer, keyed `${type}:${id}` */
export type AccessCheckPageResult = Record<string, AccessDecision>;
