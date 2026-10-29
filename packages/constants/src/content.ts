/**
 * Content system (Build Board #20), shared by server, client and the Cloudflare
 * Workers that arrive in PR 3 and PR 4. Spec: docs/features/content-system.md,
 * sections 3.2, 3.4 and 3.5.
 *
 * Nothing here talks to a network. Limits that operators tune live in server env
 * (UPLOAD_LIMIT_CONTENT_*_MB, CONTENT_QUOTA_*); the defaults below mirror them so
 * the client can show the same numbers before getStorage answers.
 */
import { z } from "zod";
import { CONTENT_PUBLIC_ID_REGEX, CONTENT_R2_PREFIXES } from "./contentKeys";

export * from "./contentKeys";

// ----------------------------------------------------------------------------
// Kinds and accepted types (spec 3.2)
// ----------------------------------------------------------------------------

export const CONTENT_KINDS = ["video", "audio", "image", "document", "file", "live"] as const;
export type ContentKindName = (typeof CONTENT_KINDS)[number];

/** Kinds a creator can upload. Live items come from #27, never from createUpload. */
export const CONTENT_UPLOAD_KINDS = ["video", "audio", "image", "document", "file"] as const;
export type ContentUploadKind = (typeof CONTENT_UPLOAD_KINDS)[number];

export const CONTENT_ALLOWED_TYPES: Record<
  ContentUploadKind,
  { mimes: readonly string[]; exts: readonly string[] }
> = {
  video: {
    mimes: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"],
    exts: ["mp4", "mov", "webm", "mkv"],
  },
  audio: {
    mimes: [
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/flac",
    ],
    exts: ["mp3", "wav", "m4a", "aac", "flac"],
  },
  image: {
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"],
    exts: ["jpg", "jpeg", "png", "webp", "gif", "heic"],
  },
  document: {
    mimes: ["application/pdf", "application/epub+zip"],
    exts: ["pdf", "epub"],
  },
  file: {
    mimes: ["application/zip"],
    exts: ["zip"],
  },
};

export const CONTENT_PREVIEW_MAX_SECONDS = 60;
export const CONTENT_TITLE_MAX = 140;
export const CONTENT_DESCRIPTION_MAX = 2000;
export const CONTENT_CHAPTERS_MAX = 100;

/** Defaults for the server env limits, in MB (spec 3.2). */
export const CONTENT_SIZE_LIMIT_DEFAULTS_MB: Record<ContentUploadKind, number> = {
  video: 2048,
  audio: 500,
  image: 25,
  document: 100,
  file: 500,
};
export const CONTENT_QUOTA_DEFAULT_MB = 5120;
export const CONTENT_QUOTA_VIDEO_MINUTES_DEFAULT = 300;

// ----------------------------------------------------------------------------
// Upload mechanics (spec 3.5)
// ----------------------------------------------------------------------------

const MB = 1024 * 1024;

export const CONTENT_UPLOAD = {
  /** Non video files below this size use one presigned PUT; at or above it, multipart */
  singlePutMaxBytes: 100 * MB,
  /** R2 multipart part size. Every part but the last is exactly this size. */
  partBytes: 10 * MB,
  /** signParts presigns at most this many part URLs per call */
  signPartsBatchMax: 50,
  /** S3 and R2 allow at most 10,000 parts per upload */
  maxParts: 10_000,
  /** Presigned PUT and part URLs live this long */
  presignTtlSeconds: 15 * 60,
  /** Stream direct creator upload URL lifetime */
  streamUploadExpiryHours: 6,
  /** Stream maxDurationSeconds is the creator's minutes left, capped here */
  streamMaxDurationSeconds: 4 * 60 * 60,
  /** tus-js-client chunk size for Stream (a multiple of 256 KiB, at least 5 MiB) */
  streamChunkBytes: 50 * MB,
} as const;

/** Number of parts for a multipart upload of `size` bytes. */
export function contentPartCount(size: number): number {
  return Math.max(1, Math.ceil(size / CONTENT_UPLOAD.partBytes));
}

/** True when a non video upload of this size uses multipart. */
export function contentUsesMultipart(kind: ContentUploadKind, size: number): boolean {
  return kind !== "video" && size >= CONTENT_UPLOAD.singlePutMaxBytes;
}

// ----------------------------------------------------------------------------
// Public ids and object keys (spec 3.3 and 3.4)
// ----------------------------------------------------------------------------

// CONTENT_PUBLIC_ID_* and CONTENT_R2_PREFIXES live in contentKeys.ts (no zod) so the
// media gateway Worker can import them without bundling zod. Re-exported at the top.

export const contentPublicIdSchema = z
  .string()
  .regex(CONTENT_PUBLIC_ID_REGEX, { message: "Invalid content id" });

export function contentIncomingKey(publicId: string, ext: string): string {
  return `${CONTENT_R2_PREFIXES.incoming}/${publicId}/original.${ext.toLowerCase()}`;
}

// ----------------------------------------------------------------------------
// Type checks shared by client and server
// ----------------------------------------------------------------------------

export function contentExtensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Declared type check at createUpload (the first of three, spec 3.11): the MIME
 * type and the file extension must both belong to the chosen kind.
 */
export function contentTypeAllowed(
  kind: ContentUploadKind,
  mimeType: string,
  fileName: string
): boolean {
  const allowed = CONTENT_ALLOWED_TYPES[kind];
  const mime = mimeType.split(";")[0]!.trim().toLowerCase();
  return allowed.mimes.includes(mime) && allowed.exts.includes(contentExtensionOf(fileName));
}

// ----------------------------------------------------------------------------
// tRPC input schemas (spec 3.10). Amounts are not part of PR 2.
// ----------------------------------------------------------------------------

const titleSchema = z.string().trim().min(1).max(CONTENT_TITLE_MAX);

export const contentCreateUploadSchema = z.object({
  kind: z.enum(CONTENT_UPLOAD_KINDS),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
  /** Defaults to the file name without its extension */
  title: titleSchema.optional(),
  /** Video only: lets the server refuse a video longer than the minutes left */
  durationSec: z.number().int().positive().optional(),
});
export type ContentCreateUploadInput = z.infer<typeof contentCreateUploadSchema>;

/** R2 multipart upload id. Returned by createUpload and sent back on each call. */
const uploadIdSchema = z.string().min(1).max(1024);

export const contentSignPartsSchema = z.object({
  publicId: contentPublicIdSchema,
  uploadId: uploadIdSchema,
  partNumbers: z
    .array(z.number().int().min(1).max(CONTENT_UPLOAD.maxParts))
    .min(1)
    .max(CONTENT_UPLOAD.signPartsBatchMax),
});

export const contentCompleteUploadSchema = z.object({
  publicId: contentPublicIdSchema,
  /** Multipart only */
  uploadId: uploadIdSchema.optional(),
  /** Multipart only: the ETag R2 returned for each part */
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(CONTENT_UPLOAD.maxParts),
        etag: z.string().min(1).max(128),
      })
    )
    .max(CONTENT_UPLOAD.maxParts)
    .optional(),
});

export const contentPublicIdInputSchema = z.object({ publicId: contentPublicIdSchema });

export const contentAbortUploadSchema = z.object({
  publicId: contentPublicIdSchema,
  /** Multipart only, so R2 drops the parts already sent */
  uploadId: uploadIdSchema.optional(),
});

export const contentListSchema = z.object({
  kind: z.enum(CONTENT_KINDS).optional(),
  status: z.enum(["uploading", "processing", "ready", "failed", "blocked"]).optional(),
  publishState: z.enum(["draft", "published", "archived"]).optional(),
  /** Recently removed: deleted items that can still be restored (PR 6) */
  removed: z.boolean().optional(),
  /** publicId of the last item on the previous page */
  cursor: contentPublicIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export const contentChapterSchema = z.object({
  startMs: z.number().int().min(0),
  title: z.string().trim().min(1).max(100),
});

export const contentPreviewConfigSchema = z.union([
  z.object({ seconds: z.number().int().min(5).max(CONTENT_PREVIEW_MAX_SECONDS) }),
  z.object({ pages: z.number().int().min(1).max(3) }),
  z.object({ blur: z.literal(true) }),
]);

/** Fields PR 2 lets the owner edit. Cover, captions and the access rule come later. */
export const contentUpdateSchema = z.object({
  publicId: contentPublicIdSchema,
  title: titleSchema.optional(),
  description: z.string().max(CONTENT_DESCRIPTION_MAX).nullable().optional(),
  allowDownload: z.boolean().optional(),
  adult: z.boolean().optional(),
  chapters: z.array(contentChapterSchema).max(CONTENT_CHAPTERS_MAX).nullable().optional(),
  previewConfig: contentPreviewConfigSchema.nullable().optional(),
});

// ----------------------------------------------------------------------------
// Processor callback (spec 3.5 step 4). The processor Worker (PR 4) posts each
// step result to POST /internal/content/processed. The API is the only writer of
// item state. The body is signed: HMAC SHA-256 over `${timestamp}.${rawBody}`.
// ----------------------------------------------------------------------------

export const CONTENT_CALLBACK_SIGNATURE_HEADER = "x-amped-signature";
/** Header value: `t={unix seconds},v1={hex hmac}` */
export const CONTENT_CALLBACK_WINDOW_SECONDS = 5 * 60;

export const CONTENT_PROCESSING_STEPS = [
  "hash",
  "csam",
  "malware",
  "normalize",
  "blur",
  "classifier",
  "done",
] as const;

const contentAssetRoleSchema = z.enum([
  "ORIGINAL",
  "RENDITION",
  "COVER",
  "BLUR",
  "PAGE_PREVIEW",
  "WAVEFORM",
  "AUDIO_PREVIEW",
  "STREAM",
  "PREVIEW_CLIP",
  "CAPTION",
  "BANNER",
]);

export const contentProcessedAssetSchema = z.object({
  role: contentAssetRoleSchema,
  storage: z.enum(["R2", "STREAM"]),
  r2Key: z.string().max(255).optional(),
  streamUid: z.string().max(64).optional(),
  variant: z.string().max(16).optional(),
  lang: z.string().max(8).optional(),
  mimeType: z.string().max(100).optional(),
  size: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  scanStatus: z.enum(["PENDING", "CLEAN", "INFECTED", "SKIPPED", "ERROR"]),
});

export const contentProcessedCallbackSchema = z.object({
  publicId: contentPublicIdSchema,
  step: z.enum(CONTENT_PROCESSING_STEPS),
  /**
   * ok: step passed, keep going (or READY when step is "done").
   * failed: processing error, item FAILED, reserved bytes released.
   * blocked: blocklist, CSAM or malware, item BLOCKED.
   * held: classifier found explicit content on an item not labeled 18+, moderation HELD.
   */
  outcome: z.enum(["ok", "failed", "blocked", "held"]),
  reason: z.string().max(255).optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  durationMs: z.number().int().nonnegative().optional(),
  pageCount: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  assets: z.array(contentProcessedAssetSchema).max(50).optional(),
});
export type ContentProcessedCallback = z.infer<typeof contentProcessedCallbackSchema>;

// ----------------------------------------------------------------------------
// Cloudflare Stream webhook (spec 3.5 step 5)
// ----------------------------------------------------------------------------

/** Header value: `time={unix seconds},sig1={hex hmac of "time.body"}` */
export const STREAM_WEBHOOK_SIGNATURE_HEADER = "webhook-signature";
export const STREAM_WEBHOOK_WINDOW_SECONDS = 5 * 60;
