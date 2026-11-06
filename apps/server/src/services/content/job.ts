/**
 * The job the processor Worker asks for (Build Board #20, PR 4, spec 3.5 step 3).
 * Built from the item and its assets. It carries no user id, email or wallet: the
 * processor only needs what to read, what kind it is, and the item's settings.
 *
 * Video jobs carry short lived signed Stream thumbnail URLs for the poster and the
 * keyframes, so the processor never holds the Stream signing key.
 */
import { prisma, type ContentItem } from "@repo/database";
import {
  contentKeyframeTimes,
  type ContentJob,
  type ContentJobKind,
  type ContentJobStatus,
} from "@repo/constants";
import { env } from "../../env";
import { getStreamVideo, signStreamToken } from "../cloudflare/stream";

/** Thumbnail tokens outlive the processor's retries (3 tries with backoff). */
const THUMBNAIL_TOKEN_SECONDS = 2 * 60 * 60;

function previewSeconds(item: ContentItem): number | null {
  const config = item.previewConfig as { seconds?: unknown } | null;
  return typeof config?.seconds === "number" ? config.seconds : null;
}

/**
 * Stream serves thumbnails on `customer-{code}.cloudflarestream.com`. The code is
 * CF_STREAM_CUSTOMER_CODE, or read from the video's own thumbnail URL.
 */
export async function streamCustomerHost(uid: string): Promise<string> {
  if (env.CF_STREAM_CUSTOMER_CODE)
    return `customer-${env.CF_STREAM_CUSTOMER_CODE}.cloudflarestream.com`;
  const video = await getStreamVideo(uid);
  const host = video.thumbnail ? new URL(video.thumbnail).host : "";
  if (!/^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(host)) {
    throw new Error("Stream customer host unknown: set CF_STREAM_CUSTOMER_CODE");
  }
  return host;
}

export function streamThumbnailUrl(host: string, token: string, seconds: number, size: number) {
  return `https://${host}/${token}/thumbnails/thumbnail.jpg?time=${seconds}s&width=${size}&height=${size}&fit=clip`;
}

export async function buildProcessorJob(publicId: string): Promise<ContentJob | null> {
  const item = await prisma.contentItem.findUnique({ where: { publicId } });
  if (!item) return null;
  const original = await prisma.contentAsset.findFirst({
    where: { contentItemId: item.id, role: { in: ["ORIGINAL", "STREAM"] } },
    orderBy: { createdAt: "asc" },
  });

  const base: ContentJob = {
    publicId: item.publicId,
    kind: item.kind.toLowerCase() as ContentJobKind,
    status: item.status.toLowerCase() as ContentJobStatus,
    title: item.title,
    adult: item.adult,
    allowDownload: item.allowDownload,
    previewSeconds: previewSeconds(item),
    incomingKey: original?.storage === "R2" ? (original.r2Key ?? null) : null,
    mimeType: original?.mimeType ?? null,
    ext: original?.r2Key ? (original.r2Key.split(".").pop() ?? null) : null,
    video: null,
  };

  // Only a video still in processing needs thumbnails; anything else is skipped
  if (item.kind !== "VIDEO" || item.status !== "PROCESSING" || !original?.streamUid) return base;

  const uid = original.streamUid;
  const host = await streamCustomerHost(uid);
  const token = signStreamToken({ uid, expiresInSeconds: THUMBNAIL_TOKEN_SECONDS });
  const times = contentKeyframeTimes(item.durationMs);
  const posterAt = item.durationMs ? Math.min(5, Math.floor(item.durationMs / 2000)) : 0;
  return {
    ...base,
    video: {
      durationMs: item.durationMs,
      posterUrl: streamThumbnailUrl(host, token, posterAt, 1280),
      keyframeUrls: times.map(t => streamThumbnailUrl(host, token, t, 640)),
    },
  };
}
