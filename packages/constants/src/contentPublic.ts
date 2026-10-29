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
import { CONTENT_UPLOAD_KINDS, contentPublicIdSchema } from "./content";
import type { ContentImageSet } from "./contentPlayer";

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

/** Report reasons, as ContentReport.reason stores them (spec 3.3). */
export const CONTENT_REPORT_REASONS = [
  "copyright",
  "csam",
  "adult",
  "harassment",
  "malware",
  "scam",
  "other",
] as const;
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

export const CONTENT_REPORT_LABELS: Record<ContentReportReason, string> = {
  copyright: "It uses my work without permission",
  csam: "It sexualizes a child",
  adult: "It is sexual or explicit and not labeled 18+",
  harassment: "It harasses or threatens someone",
  malware: "The file is harmful or a scam download",
  scam: "It is a scam or misleading",
  other: "Something else",
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
}

/** The item page's server data (spec 3.7). No playback URLs. */
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
