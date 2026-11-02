/**
 * Content system router (Build Board #20), PR 2. Spec 3.5 and 3.10.
 *
 * Owner procedures: upload, list, read and edit your own items, and see your
 * storage. PR 6a adds getReadUrl (signed delivery for anyone allowed to open the
 * item: today its owner) and captions. Publishing and public reads arrive in PR 6.
 *
 * Every owner lookup answers NOT_FOUND for an item that is not yours, so ids cannot
 * be probed. Outputs never include the numeric user id, R2 keys or Stream uids.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma, prisma, type ContentItem } from "@repo/database";
import {
  CONTENT_ALLOWED_TYPES,
  CONTENT_UPLOAD,
  contentAbortUploadSchema,
  contentCompleteUploadSchema,
  contentCreateUploadSchema,
  contentExtensionOf,
  contentIncomingKey,
  contentListSchema,
  contentPartCount,
  contentPublicIdInputSchema,
  contentSignPartsSchema,
  contentTypeAllowed,
  contentUpdateSchema,
  contentUsesMultipart,
  CONTENT_CAPTIONS,
  captionLabel,
  contentCaptionsRemoveSchema,
  contentCaptionsSetSchema,
  contentReadUrlSchema,
  normalizeWebVtt,
  CONTENT_RESTORE_DAYS,
  contentFeedSchema,
  contentListForBioSchema,
  contentPublicItemSchema,
  contentReportSchema,
  contentRetrySchema,
  type ContentUploadKind,
} from "@repo/constants";
import { privateProcedure, publicProcedure, router } from "./trpc";
import { env } from "../env";
import { hitRateLimit } from "../utils/rateLimit";
import { uuidv7 } from "../utils/uuid-v7";
import { contentUploadLimitBytes, contentUploadsOpen } from "../services/cloudflare/config";
import {
  abortR2Multipart,
  completeR2Multipart,
  createR2Multipart,
  deleteR2Object,
  presignR2Parts,
  presignR2Put,
  verifyR2Object,
} from "../services/cloudflare/r2";
import {
  createStreamDirectUpload,
  deleteStreamCaptions,
  enableStreamDownloads,
  deleteStreamVideo,
  getStreamVideo,
  putStreamCaptions,
  updateStreamVideo,
} from "../services/cloudflare/stream";
import { putR2Object, r2ObjectExists } from "../services/cloudflare/r2";
import {
  contentSitemapCount,
  contentSitemapEntries,
  findPublicCreator,
  publicCardsFor,
  publicFeed,
  publicItem,
} from "../services/content/publicView";
import { isPublicItem } from "../services/content/access";
import { buildDownload, buildPlayback, DeliveryError } from "../services/content/delivery";
import {
  VIEWER_MESSAGES,
  limitViewerReads,
  loadItemForViewer,
  viewerKey,
  viewerUserId,
} from "../services/content/viewer";
import {
  ensureQuota,
  itemMinutes,
  releaseBytes,
  reserveBytes,
  videoMinutesLeft,
} from "../services/content/quota";
import { assetRowId, enqueueVideoProcessing, failItem } from "../services/content/state";
import { publishContentJob } from "../services/cloudflare/queue";
import { fromDbKind, newContentPublicId, toDbKind } from "../services/content/ids";
import { UPLOAD_VERIFICATION_MESSAGES } from "../services/uploadVerification";

/** Upload starts per creator per minute (spec 3.10 rate limits) */
const CREATE_UPLOADS_PER_MINUTE = 30;

const MESSAGES = {
  closed: "Uploads are not open yet.",
  type: "This file type is not supported for this kind of item.",
  tooLarge: (mb: number) => `This file is larger than the ${mb} MB limit.`,
  noStorage:
    "Not enough storage left for this file. Deleted items keep their space until they are removed.",
  noMinutes: "No video minutes left. Deleted videos keep their minutes until they are removed.",
  tooLong: "This video is longer than your video minutes left.",
  rate: "Too many uploads at once. Try again in a minute.",
  state: "This upload is no longer in progress.",
  parts: "Upload parts are missing. Retry the upload.",
  notFound: "Item not found.",
  preview: "That preview setting does not apply to this kind of item.",
  queue: "Could not start processing this file. Upload it again.",
  downloadsOff: "Downloads are off for this item.",
  downloadCap: "You reached today's downloads for this item. Try again tomorrow.",
  delivery: "This item can not be opened right now. Try again soon.",
  captionsKind: "Captions are for video and audio.",
  captionsNotReady: "Add captions once processing finishes.",
  captionsFile: "This is not a WebVTT caption file. Export captions as .vtt and try again.",
  captionsMax: `Up to ${CONTENT_CAPTIONS.maxTracks} caption languages per item.`,
  captionsFailed: "Could not save the captions. Try again.",
  publishNotReady: "Publish once processing finishes.",
  publishHeld: "This item is in review. You can publish it once a reviewer clears it.",
  publishNotClear: "This item is not cleared yet. A reviewer clears it before it can be published.",
  publishAdult: "18+ items can not be published yet.",
  publishBlocked: "This item can not be published.",
  deleteBusy: "Wait until processing finishes, or cancel the upload.",
  restoreGone: "This item can no longer be restored.",
  retryState: "Only items that failed can be retried.",
  retryRate: "You can retry processing once an hour. Try again later, or upload the file again.",
  reportRate: "Too many reports at once. Try again later.",
} as const;

/** Reports per viewer per hour (spec 3.10 rate limits) */
const REPORTS_PER_HOUR = 10;

/** Downloads per viewer per item per day (decision 24). */
const DOWNLOADS_PER_DAY = 10;

/** R2 key for an audio caption track. Under derived/ so the gateway serves it. */
function captionKey(publicId: string, lang: string): string {
  return `derived/${publicId}/captions/${lang}.vtt`;
}

async function captionList(itemId: Uint8Array) {
  const rows = await prisma.contentAsset.findMany({
    where: { contentItemId: Buffer.from(itemId), role: "CAPTION" },
  });
  return rows
    .filter(row => row.lang)
    .map(row => ({ lang: row.lang!, label: captionLabel(row.lang!) }))
    .sort((a, b) => a.lang.localeCompare(b.lang));
}

function lowerStatus(status: ContentItem["status"]) {
  return status.toLowerCase() as Lowercase<ContentItem["status"]>;
}

/** The fields the owner sees. No user id, no storage keys. */
function ownerView(item: ContentItem) {
  return {
    publicId: item.publicId,
    kind: fromDbKind(item.kind),
    title: item.title,
    description: item.description,
    status: lowerStatus(item.status),
    processingStep: item.processingStep,
    failureReason: item.failureReason,
    publishState: item.publishState.toLowerCase() as "draft" | "published" | "archived",
    moderationState: item.moderationState.toLowerCase() as "pending" | "clear" | "held" | "blocked",
    allowDownload: item.allowDownload,
    adult: item.adult,
    gated: item.accessRuleId !== null,
    previewConfig: item.previewConfig,
    chapters: item.chapters,
    durationMs: item.durationMs,
    pageCount: item.pageCount,
    width: item.width,
    height: item.height,
    totalBytes: Number(item.totalBytes),
    publishedAt: item.publishedAt,
    // Recently removed items can come back until their purge date (spec 3.12)
    restorableUntil:
      item.status === "DELETED" && item.purgeAfter && item.purgeAfter > new Date()
        ? item.purgeAfter
        : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function findOwnedItem(publicId: string, userId: number): Promise<ContentItem> {
  const item = await prisma.contentItem.findUnique({ where: { publicId } });
  if (!item || item.userId !== userId || item.status === "DELETED") {
    throw new TRPCError({ code: "NOT_FOUND", message: MESSAGES.notFound });
  }
  return item;
}

function assertUploadsOpen() {
  if (!contentUploadsOpen()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MESSAGES.closed });
  }
}

function requireUploading(item: ContentItem) {
  if (item.status !== "UPLOADING") {
    throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.state });
  }
}

async function originalAsset(item: ContentItem) {
  return prisma.contentAsset.findFirst({
    where: { contentItemId: item.id, role: { in: ["ORIGINAL", "STREAM"] } },
  });
}

/** Which preview shapes each kind accepts (spec 3.3 previewConfig). */
function previewFits(kind: ContentItem["kind"], preview: object): boolean {
  if ("seconds" in preview) return kind === "VIDEO" || kind === "AUDIO";
  if ("pages" in preview) return kind === "DOCUMENT";
  if ("blur" in preview) return kind === "IMAGE";
  return false;
}

/**
 * Records the ORIGINAL (or STREAM) asset for an item in UPLOADING and returns where
 * the browser sends the bytes: a presigned R2 PUT, an R2 multipart upload, or a
 * Stream TUS URL (spec 3.5 step 1). Used by createUpload and by retryProcessing
 * when a failed item's upload is no longer kept.
 */
async function startUploadTarget(params: {
  itemId: Uint8Array;
  publicId: string;
  kind: ContentUploadKind;
  mimeType: string;
  ext: string;
  size: number;
  minutesLeft: number;
}) {
  const { itemId, publicId, kind, mimeType, ext } = params;
  const size = BigInt(params.size);
  if (kind === "video") {
    const upload = await createStreamDirectUpload({
      size: params.size,
      maxDurationSeconds: Math.min(
        params.minutesLeft * 60,
        CONTENT_UPLOAD.streamMaxDurationSeconds
      ),
      expiresAt: new Date(Date.now() + CONTENT_UPLOAD.streamUploadExpiryHours * 3600 * 1000),
    });
    await prisma.contentAsset.create({
      data: {
        id: uuidv7(),
        contentItemId: Buffer.from(itemId),
        role: "STREAM",
        storage: "STREAM",
        streamUid: upload.uid,
        mimeType,
        size,
      },
    });
    await updateStreamVideo(upload.uid, { publicId, env: env.APP_ENV }).catch(error =>
      console.warn(
        "[content] Stream meta update failed",
        error instanceof Error ? error.message : error
      )
    );
    return {
      publicId,
      target: {
        type: "stream" as const,
        uploadUrl: upload.uploadUrl,
        chunkBytes: CONTENT_UPLOAD.streamChunkBytes,
      },
    };
  }

  const key = contentIncomingKey(publicId, ext);
  await prisma.contentAsset.create({
    data: {
      id: uuidv7(),
      contentItemId: Buffer.from(itemId),
      role: "ORIGINAL",
      storage: "R2",
      r2Key: key,
      mimeType,
      size,
    },
  });

  if (contentUsesMultipart(kind, params.size)) {
    const uploadId = await createR2Multipart(key, mimeType);
    return {
      publicId,
      target: {
        type: "multipart" as const,
        uploadId,
        partCount: contentPartCount(params.size),
        partBytes: CONTENT_UPLOAD.partBytes,
      },
    };
  }

  return {
    publicId,
    target: {
      type: "put" as const,
      url: await presignR2Put(key, mimeType, params.size),
      headers: { "Content-Type": mimeType },
    },
  };
}

export const contentRouter = router({
  /**
   * Validate, reserve quota, create the item and return where the bytes go:
   * a presigned R2 PUT, an R2 multipart upload, or a Stream TUS URL (spec 3.5 step 1).
   */
  createUpload: privateProcedure
    .input(contentCreateUploadSchema)
    .mutation(async ({ ctx, input }) => {
      assertUploadsOpen();
      const userId = ctx.user!.sub;

      if ((await hitRateLimit(`content-upload:${userId}`, 60)) > CREATE_UPLOADS_PER_MINUTE) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: MESSAGES.rate });
      }

      const kind: ContentUploadKind = input.kind;
      if (!contentTypeAllowed(kind, input.mimeType, input.fileName)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.type });
      }
      const limit = contentUploadLimitBytes(kind);
      if (input.size > limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: MESSAGES.tooLarge(Math.round(limit / (1024 * 1024))),
        });
      }

      const quota = await ensureQuota(userId);
      const minutesLeft = videoMinutesLeft(quota);
      if (kind === "video") {
        if (minutesLeft <= 0)
          throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.noMinutes });
        if (input.durationSec && input.durationSec > minutesLeft * 60) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.tooLong });
        }
      }

      const size = BigInt(input.size);
      if (!(await reserveBytes(userId, size))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.noStorage });
      }

      const publicId = newContentPublicId();
      const ext = contentExtensionOf(input.fileName);
      const mimeType = input.mimeType.split(";")[0]!.trim().toLowerCase();
      const title = input.title ?? (input.fileName.replace(/\.[^.]+$/, "").trim() || "Untitled");

      const itemId = uuidv7();
      try {
        await prisma.contentItem.create({
          data: {
            id: itemId,
            publicId,
            userId,
            kind: toDbKind(kind),
            title: title.slice(0, 140),
            totalBytes: size,
          },
        });
        return await startUploadTarget({
          itemId,
          publicId,
          kind,
          mimeType,
          ext,
          size: input.size,
          minutesLeft,
        });
      } catch (error) {
        // Nothing reached storage: give the bytes back and drop the item
        console.error(
          "[content] createUpload failed",
          error instanceof Error ? error.message : error
        );
        await releaseBytes(userId, size);
        await prisma.contentItem.delete({ where: { id: itemId } }).catch(() => {});
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not start the upload. Try again.",
        });
      }
    }),

  /** Presign R2 part URLs, each bound to its exact length (spec 3.5 step 1). */
  signParts: privateProcedure.input(contentSignPartsSchema).mutation(async ({ ctx, input }) => {
    assertUploadsOpen();
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    requireUploading(item);
    const size = Number(item.totalBytes);
    if (
      item.kind === "VIDEO" ||
      !contentUsesMultipart(fromDbKind(item.kind) as ContentUploadKind, size)
    ) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.state });
    }
    const partCount = contentPartCount(size);
    if (input.partNumbers.some(part => part > partCount)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.parts });
    }
    const asset = await originalAsset(item);
    if (!asset?.r2Key) throw new TRPCError({ code: "NOT_FOUND", message: MESSAGES.notFound });
    return {
      parts: await presignR2Parts(asset.r2Key, input.uploadId, size, input.partNumbers),
    };
  }),

  /**
   * Confirm the bytes arrived: Stream has the video, or R2 has an object of the
   * declared size whose first 4 KB are an allowed type for the kind (spec 3.5 step 2).
   */
  completeUpload: privateProcedure
    .input(contentCompleteUploadSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await findOwnedItem(input.publicId, ctx.user!.sub);
      // Idempotent: Stream's ready webhook can land before the browser calls this,
      // and a client retry after a lost response must not read as an error
      if (item.status === "PROCESSING" || item.status === "READY") {
        return { publicId: item.publicId, status: lowerStatus(item.status) };
      }
      requireUploading(item);
      const asset = await originalAsset(item);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: MESSAGES.notFound });

      if (item.kind === "VIDEO") {
        const video = await getStreamVideo(asset.streamUid!);
        if (video.status.state === "error") {
          await failItem(item, `stream:${video.status.errReasonCode ?? "unknown"}`);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This video could not be read. Try another file.",
          });
        }
        if (video.status.state === "pendingupload") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: UPLOAD_VERIFICATION_MESSAGES.missing,
          });
        }
        await prisma.contentItem.updateMany({
          where: { id: item.id, status: "UPLOADING" },
          data: {
            status: "PROCESSING",
            processingStep: video.readyToStream ? "stream_ready" : "encoding",
          },
        });
        return { publicId: item.publicId, status: "processing" as const };
      }

      const key = asset.r2Key!;
      const size = Number(item.totalBytes);
      if (contentUsesMultipart(fromDbKind(item.kind) as ContentUploadKind, size)) {
        if (!input.uploadId || !input.parts || input.parts.length !== contentPartCount(size)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.parts });
        }
        await completeR2Multipart(key, input.uploadId, input.parts);
      }

      const allowed = CONTENT_ALLOWED_TYPES[fromDbKind(item.kind) as ContentUploadKind].mimes;
      const verification = await verifyR2Object(
        key,
        item.totalBytes,
        asset.mimeType ?? "",
        allowed
      );
      if (!verification.ok) {
        if (verification.reason === "missing") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: UPLOAD_VERIFICATION_MESSAGES.missing,
          });
        }
        console.warn(
          "[content] rejected upload",
          JSON.stringify({
            publicId: item.publicId,
            reason: verification.reason,
            detail: verification.detail,
          })
        );
        await deleteR2Object(key).catch(() => {});
        await failItem(item, verification.reason, { from: ["UPLOADING"] });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: UPLOAD_VERIFICATION_MESSAGES[verification.reason],
        });
      }

      const moved = await prisma.contentItem.updateMany({
        where: { id: item.id, status: "UPLOADING" },
        data: { status: "PROCESSING", processingStep: "queued" },
      });
      // Only the call that moved the item queues it, so a retry never queues twice
      if (moved.count === 1) {
        try {
          await publishContentJob({ type: "r2", publicId: item.publicId });
        } catch (error) {
          console.error(
            "[content] queue publish failed",
            JSON.stringify({
              publicId: item.publicId,
              error: error instanceof Error ? error.message : String(error),
            })
          );
          await deleteR2Object(key).catch(() => {});
          await failItem(item, "queue_unavailable", { from: ["PROCESSING"] });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: MESSAGES.queue,
          });
        }
      }
      return { publicId: item.publicId, status: "processing" as const };
    }),

  /** Stop an upload: drop what reached storage and give the bytes back. */
  abortUpload: privateProcedure.input(contentAbortUploadSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    if (item.status !== "UPLOADING" && item.status !== "FAILED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.state });
    }
    const asset = await originalAsset(item);
    try {
      if (asset?.streamUid) await deleteStreamVideo(asset.streamUid);
      if (asset?.r2Key) {
        if (input.uploadId) await abortR2Multipart(asset.r2Key, input.uploadId).catch(() => {});
        await deleteR2Object(asset.r2Key);
      }
    } catch (error) {
      // Storage cleanup is retried by the bucket lifecycle (spec 3.17 step 3)
      console.warn(
        "[content] abort cleanup failed",
        error instanceof Error ? error.message : error
      );
    }
    const now = new Date();
    await prisma.$transaction(async tx => {
      const changed = await tx.contentItem.updateMany({
        where: { id: item.id, status: { in: ["UPLOADING", "FAILED"] } },
        data: { status: "DELETED", deletedAt: now, purgeAfter: now },
      });
      // FAILED items released their bytes when they failed
      if (changed.count === 1 && item.status === "UPLOADING") {
        await releaseBytes(item.userId, item.totalBytes, tx);
      }
    });
    return { publicId: item.publicId, status: "deleted" as const };
  }),

  /** The creator's library, newest first (spec 3.10, board cs1). */
  list: privateProcedure.input(contentListSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    let cursorOwned = false;
    if (input.cursor) {
      const cursor = await prisma.contentItem.findUnique({
        where: { publicId: input.cursor },
        select: { userId: true },
      });
      cursorOwned = cursor?.userId === userId;
    }
    const items = await prisma.contentItem.findMany({
      where: {
        userId,
        ...(input.removed
          ? { status: "DELETED" as const, purgeAfter: { gt: new Date() } }
          : {
              status: input.status
                ? (input.status.toUpperCase() as ContentItem["status"])
                : { not: "DELETED" as const },
            }),
        ...(input.kind ? { kind: toDbKind(input.kind) } : {}),
        ...(input.publishState
          ? { publishState: input.publishState.toUpperCase() as ContentItem["publishState"] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursorOwned ? { cursor: { publicId: input.cursor! }, skip: 1 } : {}),
      take: input.limit + 1,
    });
    const page = items.slice(0, input.limit);
    return {
      items: page.map(ownerView),
      nextCursor: items.length > input.limit ? page[page.length - 1]!.publicId : null,
    };
  }),

  /** One item with its assets, without storage keys. */
  get: privateProcedure.input(contentPublicIdInputSchema).query(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    const assets = await prisma.contentAsset.findMany({
      where: { contentItemId: item.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      ...ownerView(item),
      assets: assets.map(asset => ({
        role: asset.role.toLowerCase(),
        variant: asset.variant,
        lang: asset.lang,
        mimeType: asset.mimeType,
        size: asset.size === null ? null : Number(asset.size),
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        scanStatus: asset.scanStatus.toLowerCase(),
      })),
    };
  }),

  /** Title, description, downloads, 18+, chapters and preview (spec 3.10, board cs3). */
  update: privateProcedure.input(contentUpdateSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    if (input.previewConfig && !previewFits(item.kind, input.previewConfig)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.preview });
    }
    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.allowDownload !== undefined ? { allowDownload: input.allowDownload } : {}),
        ...(input.adult !== undefined ? { adult: input.adult } : {}),
        ...(input.chapters !== undefined
          ? { chapters: input.chapters === null ? Prisma.JsonNull : input.chapters }
          : {}),
        ...(input.previewConfig !== undefined
          ? {
              previewConfig: input.previewConfig === null ? Prisma.JsonNull : input.previewConfig,
            }
          : {}),
      },
    });
    // Turning downloads on after READY: Stream makes the MP4 only when asked (spec 3.6)
    if (
      input.allowDownload === true &&
      !item.allowDownload &&
      item.kind === "VIDEO" &&
      item.status === "READY"
    ) {
      const stream = await originalAsset(item);
      if (stream?.streamUid) {
        await enableStreamDownloads(stream.streamUid).catch(error =>
          console.warn(
            "[content] Stream downloads not enabled",
            error instanceof Error ? error.message : error
          )
        );
      }
    }
    return ownerView(updated);
  }),

  // --------------------------------------------------------------------------
  // Publishing, delete and restore (spec 3.10, 3.12), PR 6
  // --------------------------------------------------------------------------

  /** Puts a finished, cleared item on the creator's public pages. */
  publish: privateProcedure.input(contentPublicIdInputSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    if (item.status === "BLOCKED" || item.moderationState === "BLOCKED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.publishBlocked });
    }
    if (item.status !== "READY") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.publishNotReady });
    }
    if (item.moderationState === "HELD") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.publishHeld });
    }
    // Only a READY, CLEAR, non 18+ item publishes (spec 3.10). 18+ stays off every
    // public surface until the age gate lands (#28), so it never reaches the pages.
    if (item.adult) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.publishAdult });
    }
    if (item.moderationState !== "CLEAR") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.publishNotClear });
    }
    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: { publishState: "PUBLISHED", publishedAt: item.publishedAt ?? new Date() },
    });
    return ownerView(updated);
  }),

  /** Takes an item off public pages. It stays in the library as a draft. */
  unpublish: privateProcedure.input(contentPublicIdInputSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    const updated = await prisma.contentItem.update({
      where: { id: item.id },
      data: { publishState: "DRAFT" },
    });
    return ownerView(updated);
  }),

  /**
   * Soft delete (spec 3.12). A finished item leaves every page at once and can
   * be restored for 30 days before the purge. Its files stay in the bucket
   * until then, so its space stays charged: the creator can not store more than
   * the limit while the files are still there. The purge gives the space back.
   * Failed and blocked items gave their space back already and are purged next run.
   */
  delete: privateProcedure.input(contentPublicIdInputSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    if (item.status === "UPLOADING" || item.status === "PROCESSING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.deleteBusy });
    }
    const now = new Date();
    if (item.status === "READY") {
      const purgeAfter = new Date(now.getTime() + CONTENT_RESTORE_DAYS * 24 * 3600 * 1000);
      await prisma.contentItem.updateMany({
        where: { id: item.id, status: "READY" },
        data: { status: "DELETED", publishState: "DRAFT", deletedAt: now, purgeAfter },
      });
      return { publicId: item.publicId, status: "deleted" as const, restorableUntil: purgeAfter };
    }
    await prisma.contentItem.updateMany({
      where: { id: item.id, status: { in: ["FAILED", "BLOCKED"] } },
      data: { status: "DELETED", publishState: "DRAFT", deletedAt: now, purgeAfter: now },
    });
    return { publicId: item.publicId, status: "deleted" as const, restorableUntil: null };
  }),

  /**
   * Brings a recently removed item back as a draft. Its space was never given
   * away (the files stay until the purge), so there is nothing to reclaim here.
   */
  restore: privateProcedure.input(contentPublicIdInputSchema).mutation(async ({ ctx, input }) => {
    const item = await prisma.contentItem.findUnique({ where: { publicId: input.publicId } });
    if (!item || item.userId !== ctx.user!.sub) {
      throw new TRPCError({ code: "NOT_FOUND", message: MESSAGES.notFound });
    }
    const now = new Date();
    if (item.status !== "DELETED" || !item.purgeAfter || item.purgeAfter <= now) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.restoreGone });
    }
    const restored = await prisma.contentItem.updateMany({
      where: { id: item.id, status: "DELETED", purgeAfter: { gt: now } },
      data: { status: "READY", deletedAt: null, purgeAfter: null },
    });
    // The purge won the race: the files are gone and the space is already free
    if (restored.count !== 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.restoreGone });
    }
    return ownerView({ ...item, status: "READY", deletedAt: null, purgeAfter: null });
  }),

  /**
   * Retries a FAILED item (spec 3.10). Processing runs again when the source is
   * still kept: Stream keeps a video, and an R2 upload is kept when processing
   * never started. Otherwise the answer is needs_file, and the creator uploads
   * the file again into the same item, keeping its title, description and
   * chapters. Re-running processing is limited to once an hour per item.
   */
  retryProcessing: privateProcedure.input(contentRetrySchema).mutation(async ({ ctx, input }) => {
    assertUploadsOpen();
    const userId = ctx.user!.sub;
    const item = await findOwnedItem(input.publicId, userId);
    if (item.status !== "FAILED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.retryState });
    }
    const source = await originalAsset(item);

    if (!input.file) {
      let kept = false;
      if (item.kind === "VIDEO" && source?.streamUid) {
        const video = await getStreamVideo(source.streamUid).catch(() => null);
        kept = !!video?.readyToStream && video.status.state === "ready";
      } else if (source?.r2Key?.startsWith("incoming/")) {
        kept = await r2ObjectExists(source.r2Key).catch(() => false);
      }
      if (!kept) return { status: "needs_file" as const, publicId: item.publicId };

      if ((await hitRateLimit(`content-retry:${item.publicId}`, 3600)) > 1) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: MESSAGES.retryRate });
      }
      // The item goes back to READY with its video minutes charged again, and a
      // failed item was never charged, so the creator has to have them left.
      const minutes = itemMinutes(item);
      const minutesLeft = videoMinutesLeft(await ensureQuota(userId));
      if (minutes > minutesLeft) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: minutesLeft <= 0 ? MESSAGES.noMinutes : MESSAGES.tooLong,
        });
      }
      if (!(await reserveBytes(userId, item.totalBytes))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.noStorage });
      }
      const moved = await prisma.contentItem.updateMany({
        where: { id: item.id, status: "FAILED" },
        data: {
          status: "PROCESSING",
          processingStep: item.kind === "VIDEO" ? "stream_ready" : "queued",
          failureReason: null,
        },
      });
      if (moved.count !== 1) {
        await releaseBytes(userId, item.totalBytes);
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.retryState });
      }
      try {
        if (item.kind === "VIDEO") await enqueueVideoProcessing(item.publicId);
        else await publishContentJob({ type: "r2", publicId: item.publicId });
      } catch (error) {
        console.error(
          "[content] retry queue publish failed",
          JSON.stringify({
            publicId: item.publicId,
            error: error instanceof Error ? error.message : String(error),
          })
        );
        await failItem(item, "queue_unavailable", { from: ["PROCESSING"] });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MESSAGES.queue });
      }
      return { status: "processing" as const, publicId: item.publicId };
    }

    // Upload the file again into the same item
    const file = input.file;
    const kind = fromDbKind(item.kind) as ContentUploadKind;
    if (!contentTypeAllowed(kind, file.mimeType, file.fileName)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.type });
    }
    const limit = contentUploadLimitBytes(kind);
    if (file.size > limit) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: MESSAGES.tooLarge(Math.round(limit / (1024 * 1024))),
      });
    }
    if ((await hitRateLimit(`content-upload:${userId}`, 60)) > CREATE_UPLOADS_PER_MINUTE) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: MESSAGES.rate });
    }
    const quota = await ensureQuota(userId);
    const minutesLeft = videoMinutesLeft(quota);
    if (kind === "video") {
      if (minutesLeft <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.noMinutes });
      }
      if (file.durationSec && file.durationSec > minutesLeft * 60) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.tooLong });
      }
    }
    const size = BigInt(file.size);
    if (!(await reserveBytes(userId, size))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.noStorage });
    }
    const mimeType = file.mimeType.split(";")[0]!.trim().toLowerCase();
    const oldStreamUid = source?.streamUid ?? null;
    const reset = await prisma.$transaction(async tx => {
      const moved = await tx.contentItem.updateMany({
        where: { id: item.id, status: "FAILED" },
        data: {
          status: "UPLOADING",
          totalBytes: size,
          processingStep: null,
          failureReason: null,
          moderationState: "PENDING",
          moderationReason: null,
          durationMs: null,
          pageCount: null,
          width: null,
          height: null,
          sha256: null,
        },
      });
      if (moved.count !== 1) return false;
      // The failed run's rows point at objects the processor already removed
      await tx.contentAsset.deleteMany({ where: { contentItemId: item.id } });
      return true;
    });
    if (!reset) {
      await releaseBytes(userId, size);
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.retryState });
    }
    if (oldStreamUid) await deleteStreamVideo(oldStreamUid).catch(() => {});
    try {
      const started = await startUploadTarget({
        itemId: item.id,
        publicId: item.publicId,
        kind,
        mimeType,
        ext: contentExtensionOf(file.fileName),
        size: file.size,
        minutesLeft,
      });
      return { status: "uploading" as const, ...started };
    } catch (error) {
      console.error(
        "[content] retry upload start failed",
        error instanceof Error ? error.message : error
      );
      await failItem({ ...item, totalBytes: size }, "upload_start_failed", {
        from: ["UPLOADING"],
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not start the upload. Try again.",
      });
    }
  }),

  // --------------------------------------------------------------------------
  // Public reads (spec 3.7, 3.10), PR 6. No email, wallet or numeric id.
  // --------------------------------------------------------------------------

  /** Cards for a content block, keyed by publicId. Unknown or closed ids are left out. */
  listForBio: publicProcedure.input(contentListForBioSchema).query(async ({ ctx, input }) => {
    await limitViewerReads(ctx, "content-public");
    const creator = await findPublicCreator(input.handle);
    if (!creator) return { cards: {} };
    return { cards: await publicCardsFor(creator.id, input.publicIds) };
  }),

  /** The creator feed page (#26), newest first. */
  feed: publicProcedure.input(contentFeedSchema).query(async ({ ctx, input }) => {
    await limitViewerReads(ctx, "content-public");
    const creator = await findPublicCreator(input.handle);
    if (!creator) throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
    return publicFeed(creator, { kind: input.kind, cursor: input.cursor, limit: input.limit });
  }),

  /** The item page's metadata. Playback URLs come from getReadUrl in the browser. */
  getPublic: publicProcedure.input(contentPublicItemSchema).query(async ({ ctx, input }) => {
    await limitViewerReads(ctx, "content-public");
    const creator = await findPublicCreator(input.handle);
    const item = creator ? await publicItem(creator, input.publicId) : null;
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
    return item;
  }),

  /**
   * Report content (spec 3.11). Recorded for the admin queue (PR 7). A CSAM
   * report also raises an alert line for on call; nothing is taken down by a
   * report alone, so a report can not be used to remove someone's work.
   */
  report: publicProcedure.input(contentReportSchema).mutation(async ({ ctx, input }) => {
    const key = `content-report:${viewerKey(ctx)}`;
    if ((await hitRateLimit(key, 3600)) > REPORTS_PER_HOUR) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: MESSAGES.reportRate });
    }
    const item = await prisma.contentItem.findUnique({
      where: { publicId: input.publicId },
      include: { user: { select: { page_status: true, block: true } } },
    });
    const viewerId = viewerUserId(ctx);
    if (!item || (!isPublicItem(item, item.user) && item.userId !== viewerId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
    }
    await prisma.contentReport.create({
      data: {
        id: uuidv7(),
        contentItemId: item.id,
        reporterUserId: viewerId,
        reason: input.reason,
        details: input.details || null,
      },
    });
    const line = JSON.stringify({ publicId: item.publicId, reason: input.reason });
    if (input.reason === "csam") console.error("[content] ALERT csam report", line);
    else console.info("[content] report", line);
    return { received: true };
  }),

  /** Public items for the sitemap (decision 23). */
  getSitemapCount: publicProcedure.query(async () => ({ total: await contentSitemapCount() })),

  getSitemapEntries: publicProcedure
    .input(
      z.object({
        // The offset grows with the page, so the page is capped: this procedure is
        // public and unauthenticated, and a huge offset would cost the database.
        page: z.number().int().min(0).max(1000),
        pageSize: z.number().int().min(1).max(10_000),
      })
    )
    .query(async ({ input }) => contentSitemapEntries(input.page, input.pageSize)),

  /**
   * Signed URLs to open an item (spec 3.6), or a single use download link
   * (decision 24). Anyone the access rules allow: today the owner previewing
   * their own item; public items once PR 6 adds publishing.
   */
  getReadUrl: publicProcedure.input(contentReadUrlSchema).query(async ({ ctx, input }) => {
    await limitViewerReads(ctx);
    const { item, assets, access } = await loadItemForViewer(input.publicId, viewerUserId(ctx));
    try {
      if (input.download) {
        if (!item.allowDownload) {
          throw new TRPCError({ code: "FORBIDDEN", message: MESSAGES.downloadsOff });
        }
        const key = `content-dl:${viewerKey(ctx)}:${item.publicId}`;
        if ((await hitRateLimit(key, 24 * 60 * 60)) > DOWNLOADS_PER_DAY) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: MESSAGES.downloadCap });
        }
        return { playback: null, download: await buildDownload(item, assets) };
      }
      return { playback: await buildPlayback(item, assets, access), download: null };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof DeliveryError && error.reason === "not_ready") {
        throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
      }
      console.error(
        "[content] read url failed",
        JSON.stringify({
          publicId: item.publicId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MESSAGES.delivery });
    }
  }),

  /**
   * Adds or replaces the caption track for one language (fan library spec 3.5).
   * Video captions go to Stream and ride in the manifest; audio captions are an
   * R2 file served through the gateway.
   */
  setCaptions: privateProcedure.input(contentCaptionsSetSchema).mutation(async ({ ctx, input }) => {
    const item = await findOwnedItem(input.publicId, ctx.user!.sub);
    if (item.kind !== "VIDEO" && item.kind !== "AUDIO") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.captionsKind });
    }
    if (item.status !== "READY") {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.captionsNotReady });
    }
    const vtt = normalizeWebVtt(input.vtt);
    if (!vtt) throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.captionsFile });

    const current = await captionList(item.id);
    if (
      !current.some(track => track.lang === input.lang) &&
      current.length >= CONTENT_CAPTIONS.maxTracks
    ) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.captionsMax });
    }

    const id = assetRowId(item.id, "CAPTION", null, input.lang);
    const size = BigInt(new TextEncoder().encode(vtt).length);
    try {
      if (item.kind === "VIDEO") {
        const stream = await originalAsset(item);
        if (!stream?.streamUid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MESSAGES.captionsNotReady });
        }
        await putStreamCaptions(stream.streamUid, input.lang, vtt);
        const data = {
          storage: "STREAM" as const,
          streamUid: stream.streamUid,
          r2Key: null,
          mimeType: "text/vtt",
          size,
          scanStatus: "SKIPPED" as const,
        };
        await prisma.contentAsset.upsert({
          where: { id },
          create: { id, contentItemId: item.id, role: "CAPTION", lang: input.lang, ...data },
          update: data,
        });
      } else {
        const key = captionKey(item.publicId, input.lang);
        await putR2Object(key, vtt, "text/vtt; charset=utf-8");
        const data = {
          storage: "R2" as const,
          r2Key: key,
          streamUid: null,
          mimeType: "text/vtt",
          size,
          // Validated text the API wrote itself; nothing executable to scan
          scanStatus: "SKIPPED" as const,
        };
        await prisma.contentAsset.upsert({
          where: { id },
          create: { id, contentItemId: item.id, role: "CAPTION", lang: input.lang, ...data },
          update: data,
        });
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error(
        "[content] captions save failed",
        JSON.stringify({
          publicId: item.publicId,
          lang: input.lang,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MESSAGES.captionsFailed });
    }
    return { captions: await captionList(item.id) };
  }),

  removeCaptions: privateProcedure
    .input(contentCaptionsRemoveSchema)
    .mutation(async ({ ctx, input }) => {
      const item = await findOwnedItem(input.publicId, ctx.user!.sub);
      const id = assetRowId(item.id, "CAPTION", null, input.lang);
      const row = await prisma.contentAsset.findUnique({ where: { id } });
      if (row) {
        try {
          if (row.streamUid) await deleteStreamCaptions(row.streamUid, input.lang);
          if (row.r2Key) await deleteR2Object(row.r2Key);
        } catch (error) {
          console.error(
            "[content] captions remove failed",
            JSON.stringify({
              publicId: item.publicId,
              lang: input.lang,
              error: error instanceof Error ? error.message : String(error),
            })
          );
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MESSAGES.captionsFailed });
        }
        await prisma.contentAsset.delete({ where: { id } });
      }
      return { captions: await captionList(item.id) };
    }),

  /** Quota and use by kind for the storage meter (spec 3.10, board cs1). */
  getStorage: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;
    const quota = await ensureQuota(userId);
    const byKind = await prisma.contentItem.groupBy({
      by: ["kind"],
      where: {
        userId,
        // Deleted items keep their space until the purge, so the meter counts
        // the ones still in their restore window (spec 3.12).
        OR: [
          { status: { in: ["READY", "PROCESSING"] } },
          { status: "DELETED", purgeAfter: { gt: new Date() } },
        ],
      },
      _sum: { totalBytes: true },
    });
    // The meter also counts the creator's profile and theme uploads (spec 3.3)
    const uploadedFiles = await prisma.uploadedFile.aggregate({
      where: { user_id: userId, status: "COMPLETED" },
      _sum: { size: true },
    });
    return {
      uploadsOpen: contentUploadsOpen(),
      bytesLimit: Number(quota.bytesLimit),
      bytesUsed: Number(quota.bytesUsed),
      bytesReserved: Number(quota.bytesReserved),
      pageFilesBytes: Number(uploadedFiles._sum.size ?? 0n),
      byKind: Object.fromEntries(
        byKind.map(row => [fromDbKind(row.kind), Number(row._sum.totalBytes ?? 0n)])
      ),
      videoMinutesLimit: quota.videoMinutesLimit,
      videoMinutesUsed: quota.videoMinutesUsed,
      limits: {
        video: contentUploadLimitBytes("video"),
        audio: contentUploadLimitBytes("audio"),
        image: contentUploadLimitBytes("image"),
        document: contentUploadLimitBytes("document"),
        file: contentUploadLimitBytes("file"),
      },
    };
  }),
});
