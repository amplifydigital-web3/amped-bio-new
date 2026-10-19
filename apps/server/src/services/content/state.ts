/**
 * Content item state (Build Board #20, spec 3.5). The API is the only writer of item
 * state: the router, the Stream webhook and the processor callback all come here.
 *
 *   UPLOADING --completeUpload--> PROCESSING --processor "done"--> READY
 *       |                             |
 *       +--abort / sweep--> DELETED   +--failed or 2h idle--> FAILED   +--blocked--> BLOCKED
 *
 * Every transition is a conditional update on the current status, so a retried
 * webhook or callback cannot commit quota twice.
 */
import { prisma, type ContentItem, type ContentAssetRole, type ScanStatus } from "@repo/database";
import type { ContentProcessedCallback } from "@repo/constants";
import { createHash } from "node:crypto";
import { commitBytes, minutesForDuration, releaseBytes } from "./quota";
import { uuidv7 } from "../../utils/uuid-v7";
import { publishContentJob } from "../cloudflare/queue";
import { createStreamClip, enableStreamDownloads } from "../cloudflare/stream";
import { env } from "../../env";

/** Items left in UPLOADING longer than this are failed and their bytes released. */
export const UPLOADING_TIMEOUT_MS = 24 * 60 * 60 * 1000;

type ItemRef = Pick<ContentItem, "id" | "userId" | "totalBytes">;

/**
 * Moves an item from one of `from` to FAILED (or BLOCKED) and releases its reserved
 * bytes, once. Returns false when the item had already left those states.
 */
export async function failItem(
  item: ItemRef,
  reason: string,
  options: { from?: Array<ContentItem["status"]>; blocked?: boolean } = {}
): Promise<boolean> {
  const from = options.from ?? ["UPLOADING", "PROCESSING"];
  return prisma.$transaction(async tx => {
    const changed = await tx.contentItem.updateMany({
      where: { id: item.id, status: { in: from } },
      data: options.blocked
        ? {
            status: "BLOCKED",
            moderationState: "BLOCKED",
            moderationReason: reason.slice(0, 255),
            processingStep: null,
          }
        : { status: "FAILED", failureReason: reason.slice(0, 255), processingStep: null },
    });
    if (changed.count !== 1) return false;
    await releaseBytes(item.userId, item.totalBytes, tx);
    return true;
  });
}

// ----------------------------------------------------------------------------
// Video: Stream webhook (spec 3.5 step 5)
// ----------------------------------------------------------------------------

export interface StreamWebhookBody {
  uid?: string;
  readyToStream?: boolean;
  duration?: number;
  size?: number;
  status?: { state?: string; errReasonCode?: string; errReasonText?: string };
  meta?: Record<string, unknown>;
}

/**
 * Hands a ready video to the processor Worker (PR 4): the poster, keyframes for the
 * CSAM matcher and the classifier. A publish failure throws, so the webhook answers
 * 500 and Stream retries it. A repeat message is harmless: every step is idempotent.
 */
export async function enqueueVideoProcessing(publicId: string): Promise<void> {
  await publishContentJob({ type: "video", publicId });
  console.info("[content] video queued for processing", JSON.stringify({ publicId }));
}

export type StreamWebhookResult = "ignored" | "ready" | "failed";

export async function applyStreamWebhook(body: StreamWebhookBody): Promise<StreamWebhookResult> {
  if (!body.uid) return "ignored";
  const asset = await prisma.contentAsset.findFirst({
    where: { streamUid: body.uid, role: "STREAM" },
    include: { contentItem: true },
  });
  // Preview clips and live recordings (PR 4, #27) raise their own events; not ours yet
  if (!asset) return "ignored";
  const item = asset.contentItem;

  if (body.status?.state === "error") {
    const code = body.status.errReasonCode || "unknown";
    await failItem(item, `stream:${code}`);
    return "failed";
  }

  if (body.readyToStream && body.status?.state === "ready") {
    const durationMs =
      typeof body.duration === "number" && body.duration > 0
        ? Math.round(body.duration * 1000)
        : null;
    const moved = await prisma.contentItem.updateMany({
      where: { id: item.id, status: { in: ["UPLOADING", "PROCESSING"] } },
      data: { status: "PROCESSING", processingStep: "stream_ready", durationMs },
    });
    await prisma.contentAsset.update({
      where: { id: asset.id },
      data: { durationMs, ...(typeof body.size === "number" ? { size: BigInt(body.size) } : {}) },
    });
    if (moved.count === 1) await enqueueVideoProcessing(item.publicId);
    return "ready";
  }

  return "ignored";
}

// ----------------------------------------------------------------------------
// Processor callback (spec 3.5 step 4)
// ----------------------------------------------------------------------------

/**
 * `blocked` tells the processor to stop: the file's hash is on the blocklist and the
 * item is now BLOCKED. Anything but `applied` means stop.
 */
export type ProcessorCallbackResult = "not_found" | "ignored" | "applied" | "blocked";

/** R2 prefixes the processor may report; anything else is rejected (untrusted toolbox). */
const ASSET_KEY_PREFIXES = ["originals", "audio", "derived"];

/** Deterministic asset row id, so concurrent callbacks upsert instead of duplicating. */
function assetRowId(
  contentItemId: Uint8Array,
  role: string,
  variant: string | null,
  lang: string | null
): Buffer {
  return createHash("sha256")
    .update(Buffer.from(contentItemId))
    .update(`\0${role}\0${variant ?? ""}\0${lang ?? ""}`)
    .digest()
    .subarray(0, 16);
}

/** The client or an interactive transaction: both carry this member. */
type AssetDb = Pick<typeof prisma, "contentAsset">;

async function upsertAssets(
  contentItemId: Uint8Array,
  publicId: string,
  assets: NonNullable<ContentProcessedCallback["assets"]>,
  db: AssetDb = prisma
): Promise<void> {
  for (const asset of assets) {
    // The toolbox is untrusted: it may only describe assets under this item's own
    // public id, or a compromised worker could point one item at another's file
    if (asset.storage !== "STREAM" && asset.r2Key) {
      const [prefix, id] = asset.r2Key.split("/");
      if (id !== publicId || !ASSET_KEY_PREFIXES.includes(prefix ?? "")) {
        throw new Error(`refusing asset key ${asset.r2Key} for ${publicId}`);
      }
    }
    const match = {
      contentItemId: Buffer.from(contentItemId),
      role: asset.role as ContentAssetRole,
      variant: asset.variant ?? null,
      lang: asset.lang ?? null,
    };
    const data = {
      storage: asset.storage,
      r2Key: asset.r2Key ?? null,
      streamUid: asset.streamUid ?? null,
      mimeType: asset.mimeType ?? null,
      size: asset.size === undefined ? null : BigInt(asset.size),
      width: asset.width ?? null,
      height: asset.height ?? null,
      durationMs: asset.durationMs ?? null,
      scanStatus: asset.scanStatus as ScanStatus,
    };
    const id = assetRowId(contentItemId, match.role, match.variant, match.lang);
    await db.contentAsset.upsert({
      where: { id },
      create: { id, ...match, ...data },
      update: data,
    });
  }
}

export async function applyProcessorCallback(
  callback: ContentProcessedCallback
): Promise<ProcessorCallbackResult> {
  const item = await prisma.contentItem.findUnique({ where: { publicId: callback.publicId } });
  if (!item) return "not_found";
  // A late or repeated callback for an item that already finished changes nothing
  if (item.status !== "PROCESSING") return "ignored";

  // On a successful done the asset rows move inside the READY transaction below:
  // an upsert that outlives a failed transaction would leave ORIGINAL switched
  // while the item stays PROCESSING, and the retry would see a missing source
  if (callback.assets?.length && !(callback.step === "done" && callback.outcome === "ok")) {
    await upsertAssets(item.id, item.publicId, callback.assets);
  }

  const metadata = {
    ...(callback.sha256 ? { sha256: callback.sha256 } : {}),
    ...(callback.durationMs !== undefined ? { durationMs: callback.durationMs } : {}),
    ...(callback.pageCount !== undefined ? { pageCount: callback.pageCount } : {}),
    ...(callback.width !== undefined ? { width: callback.width } : {}),
    ...(callback.height !== undefined ? { height: callback.height } : {}),
  };

  switch (callback.outcome) {
    case "failed":
      await prisma.contentItem.update({ where: { id: item.id }, data: metadata });
      await failItem(item, callback.reason ?? `${callback.step}_failed`, { from: ["PROCESSING"] });
      return "applied";

    case "blocked":
      await prisma.contentItem.update({ where: { id: item.id }, data: metadata });
      await failItem(item, callback.reason ?? `${callback.step}_blocked`, {
        from: ["PROCESSING"],
        blocked: true,
      });
      // Malware positives join the hash blocklist (spec 3.5 step 3). CSAM matches never
      // touch these tables: they go to the restricted evidence path (spec 3.11, PR 7).
      if (callback.step === "malware" && callback.sha256) {
        await prisma.blockedContentHash.upsert({
          where: { sha256: callback.sha256 },
          update: {},
          create: { id: uuidv7(), sha256: callback.sha256, reason: "malware" },
        });
      }
      return "applied";

    case "held":
      await prisma.contentItem.update({
        where: { id: item.id },
        data: {
          ...metadata,
          processingStep: callback.step,
          moderationState: "HELD",
          moderationReason: (callback.reason ?? "classifier").slice(0, 255),
        },
      });
      return "applied";

    case "ok":
      // Spec 3.5 step 3.1: a file removed before (copyright, malware) cannot come back
      if (callback.step === "hash" && callback.sha256) {
        const listed = await prisma.blockedContentHash.findUnique({
          where: { sha256: callback.sha256 },
        });
        if (listed) {
          await prisma.contentItem.update({ where: { id: item.id }, data: metadata });
          await failItem(item, `blocklist:${listed.reason}`, {
            from: ["PROCESSING"],
            blocked: true,
          });
          return "blocked";
        }
      }
      if (callback.step !== "done") {
        await prisma.contentItem.update({
          where: { id: item.id },
          data: { ...metadata, processingStep: callback.step },
        });
        return "applied";
      }
      await prisma.$transaction(async tx => {
        if (callback.assets?.length) {
          await upsertAssets(item.id, item.publicId, callback.assets, tx);
        }
        const durationMs = callback.durationMs ?? item.durationMs;
        const ready = await tx.contentItem.updateMany({
          where: { id: item.id, status: "PROCESSING" },
          data: {
            ...metadata,
            status: "READY",
            processingStep: null,
            // A held item stays held until a reviewer clears it (spec 3.5 step 6)
            ...(item.moderationState === "PENDING" ? { moderationState: "CLEAR" as const } : {}),
          },
        });
        if (ready.count !== 1) return;
        const minutes = item.kind === "VIDEO" ? minutesForDuration(durationMs) : 0;
        await commitBytes(item.userId, item.totalBytes, minutes, tx);
      });
      if (item.kind === "VIDEO") await finishVideo(item);
      return "applied";
  }
}

/**
 * Stream side of a video at READY (spec 3.5 step 3.4 and 3.6): the preview clip when
 * the item has one, and the MP4 download when downloads are allowed. Best effort: a
 * failure is logged and the item stays READY. PR 8 reads the clip for locked previews.
 */
export async function finishVideo(item: ContentItem): Promise<void> {
  const stream = await prisma.contentAsset.findFirst({
    where: { contentItemId: item.id, role: "STREAM" },
  });
  if (!stream?.streamUid) return;
  const seconds = (item.previewConfig as { seconds?: unknown } | null)?.seconds;
  try {
    if (typeof seconds === "number" && seconds > 0) {
      const existing = await prisma.contentAsset.findFirst({
        where: { contentItemId: item.id, role: "PREVIEW_CLIP" },
      });
      if (!existing) {
        const clip = await createStreamClip(stream.streamUid, seconds, {
          publicId: item.publicId,
          clipOf: stream.streamUid,
          env: env.APP_ENV,
        });
        await prisma.contentAsset.create({
          data: {
            id: uuidv7(),
            contentItemId: item.id,
            role: "PREVIEW_CLIP",
            storage: "STREAM",
            streamUid: clip.uid,
            durationMs: seconds * 1000,
            scanStatus: "SKIPPED",
          },
        });
      }
    }
    if (item.allowDownload) await enableStreamDownloads(stream.streamUid);
  } catch (error) {
    console.error(
      "[content] video finish failed",
      JSON.stringify({
        publicId: item.publicId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
}

// ----------------------------------------------------------------------------
// Sweep (spec 3.5 step 6): uploads left unfinished for 24 hours, and items whose
// processing has not moved for 2 hours (each step bumps updatedAt).
// ----------------------------------------------------------------------------

/** Items in PROCESSING with no step reported for this long are failed. */
export const PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export async function sweepStuckProcessing(now: Date = new Date()): Promise<number> {
  const stuck = await prisma.contentItem.findMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lt: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) },
    },
    select: { id: true, userId: true, totalBytes: true },
    take: 200,
  });
  let failed = 0;
  for (const item of stuck) {
    if (await failItem(item, "processing_timeout", { from: ["PROCESSING"] })) failed += 1;
  }
  return failed;
}

export async function sweepStaleUploads(now: Date = new Date()): Promise<number> {
  const stale = await prisma.contentItem.findMany({
    where: {
      status: "UPLOADING",
      createdAt: { lt: new Date(now.getTime() - UPLOADING_TIMEOUT_MS) },
    },
    select: { id: true, userId: true, totalBytes: true },
    take: 200,
  });
  let failed = 0;
  for (const item of stale) {
    if (await failItem(item, "upload_expired", { from: ["UPLOADING"] })) failed += 1;
  }
  return failed;
}

const SWEEP_MS = 15 * 60 * 1000;
let sweeper: NodeJS.Timeout | null = null;

/** Runs both sweeps every 15 minutes. Skipped in tests. */
export function startContentSweeper(): void {
  if (sweeper || process.env.NODE_ENV === "test") return;
  const run = () =>
    void Promise.all([sweepStaleUploads(), sweepStuckProcessing()])
      .then(([uploads, processing]) => {
        if (uploads > 0 || processing > 0) {
          console.info("[content] sweep failed items", JSON.stringify({ uploads, processing }));
        }
      })
      .catch(error => console.error("[content] sweep failed", error));
  sweeper = setInterval(run, SWEEP_MS);
  sweeper.unref();
}
