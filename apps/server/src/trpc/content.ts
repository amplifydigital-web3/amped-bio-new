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
  deleteStreamVideo,
  getStreamVideo,
  putStreamCaptions,
  updateStreamVideo,
} from "../services/cloudflare/stream";
import { putR2Object } from "../services/cloudflare/r2";
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
  releaseBytes,
  reserveBytes,
  videoMinutesLeft,
} from "../services/content/quota";
import { assetRowId, failItem } from "../services/content/state";
import { publishContentJob } from "../services/cloudflare/queue";
import { fromDbKind, newContentPublicId, toDbKind } from "../services/content/ids";
import { UPLOAD_VERIFICATION_MESSAGES } from "../services/uploadVerification";

/** Upload starts per creator per minute (spec 3.10 rate limits) */
const CREATE_UPLOADS_PER_MINUTE = 30;

const MESSAGES = {
  closed: "Uploads are not open yet.",
  type: "This file type is not supported for this kind of item.",
  tooLarge: (mb: number) => `This file is larger than the ${mb} MB limit.`,
  noStorage: "Not enough storage left for this file. Delete an item or ask for more space.",
  noMinutes: "No video minutes left. Delete a video or ask for more minutes.",
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
} as const;

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
        const item = await prisma.contentItem.create({
          data: {
            id: itemId,
            publicId,
            userId,
            kind: toDbKind(kind),
            title: title.slice(0, 140),
            totalBytes: size,
          },
        });

        if (kind === "video") {
          const upload = await createStreamDirectUpload({
            size: input.size,
            maxDurationSeconds: Math.min(minutesLeft * 60, CONTENT_UPLOAD.streamMaxDurationSeconds),
            expiresAt: new Date(Date.now() + CONTENT_UPLOAD.streamUploadExpiryHours * 3600 * 1000),
          });
          await prisma.contentAsset.create({
            data: {
              id: uuidv7(),
              contentItemId: item.id,
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
            contentItemId: item.id,
            role: "ORIGINAL",
            storage: "R2",
            r2Key: key,
            mimeType,
            size,
          },
        });

        if (contentUsesMultipart(kind, input.size)) {
          const uploadId = await createR2Multipart(key, mimeType);
          return {
            publicId,
            target: {
              type: "multipart" as const,
              uploadId,
              partCount: contentPartCount(input.size),
              partBytes: CONTENT_UPLOAD.partBytes,
            },
          };
        }

        return {
          publicId,
          target: {
            type: "put" as const,
            url: await presignR2Put(key, mimeType, input.size),
            headers: { "Content-Type": mimeType },
          },
        };
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
        status: input.status
          ? (input.status.toUpperCase() as ContentItem["status"])
          : { not: "DELETED" },
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
    return ownerView(updated);
  }),

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
      where: { userId, status: { in: ["READY", "PROCESSING"] } },
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
