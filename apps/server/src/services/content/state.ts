/**
 * Content item state (Build Board #20, spec 3.5). The API is the only writer of item
 * state: the router, the Stream webhook and the processor callback all come here.
 *
 *   UPLOADING --completeUpload--> PROCESSING --processor "done"--> READY
 *       |                             |
 *       +--abort / sweep--> DELETED   +--failed--> FAILED   +--blocked--> BLOCKED
 *
 * Every transition is a conditional update on the current status, so a retried
 * webhook or callback cannot commit quota twice.
 */
import { prisma, type ContentItem, type ContentAssetRole, type ScanStatus } from "@repo/database";
import type { ContentProcessedCallback } from "@repo/constants";
import { commitBytes, minutesForDuration, releaseBytes } from "./quota";
import { uuidv7 } from "../../utils/uuid-v7";

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
 * Hands a ready video to the processor (keyframes for CSAM matching, the preview
 * clip, the poster, the classifier). The processor Worker and its Queue arrive in
 * PR 4, which replaces this body with a Queue send. Until then a ready video stays
 * PROCESSING with step "stream_ready", which is the honest state.
 */
export async function enqueueVideoProcessing(publicId: string): Promise<void> {
  console.info("[content] video ready for processing", JSON.stringify({ publicId }));
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

export type ProcessorCallbackResult = "not_found" | "ignored" | "applied";

async function upsertAssets(
  contentItemId: Uint8Array,
  assets: NonNullable<ContentProcessedCallback["assets"]>
): Promise<void> {
  for (const asset of assets) {
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
    const existing = await prisma.contentAsset.findFirst({ where: match, select: { id: true } });
    if (existing) {
      await prisma.contentAsset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.contentAsset.create({ data: { id: uuidv7(), ...match, ...data } });
    }
  }
}

export async function applyProcessorCallback(
  callback: ContentProcessedCallback
): Promise<ProcessorCallbackResult> {
  const item = await prisma.contentItem.findUnique({ where: { publicId: callback.publicId } });
  if (!item) return "not_found";
  // A late or repeated callback for an item that already finished changes nothing
  if (item.status !== "PROCESSING") return "ignored";

  if (callback.assets?.length) await upsertAssets(item.id, callback.assets);

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
      if (callback.step !== "done") {
        await prisma.contentItem.update({
          where: { id: item.id },
          data: { ...metadata, processingStep: callback.step },
        });
        return "applied";
      }
      await prisma.$transaction(async tx => {
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
      return "applied";
  }
}

// ----------------------------------------------------------------------------
// Sweep (spec 3.5 step 6). PR 2 covers abandoned uploads; the PROCESSING timeout
// arrives with the processor in PR 4, since nothing processes before then.
// ----------------------------------------------------------------------------

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

/** Runs the sweep every 15 minutes. Skipped in tests. */
export function startContentSweeper(): void {
  if (sweeper || process.env.NODE_ENV === "test") return;
  const run = () =>
    void sweepStaleUploads()
      .then(count => {
        if (count > 0) console.info("[content] expired stale uploads", JSON.stringify({ count }));
      })
      .catch(error => console.error("[content] sweep failed", error));
  sweeper = setInterval(run, SWEEP_MS);
  sweeper.unref();
}
