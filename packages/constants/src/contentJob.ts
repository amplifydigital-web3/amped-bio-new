/**
 * Content processing jobs (Build Board #20, content system PR 4, spec 3.5).
 *
 * The API puts one message on the `content-ingest` Queue per item: after
 * completeUpload verifies an R2 upload, and after Stream reports a video ready.
 * The processor Worker reads the message, asks the API for the job with a signed
 * POST to CONTENT_JOB_PATH, runs the steps, and reports each step to
 * POST /internal/content/processed. The API stays the only writer of item state.
 *
 * No zod here: the processor Worker imports this file by path.
 */
import { CONTENT_PUBLIC_ID_REGEX } from "./contentKeys";

/** Signed like the processor callback: `x-amped-signature: t={unix},v1={hex}` */
export const CONTENT_JOB_PATH = "/internal/content/job";
export const CONTENT_CALLBACK_PATH = "/internal/content/processed";

/** Queue message. `r2` for files in R2, `video` for a Stream video that is ready. */
export interface ContentQueueMessage {
  type: "r2" | "video";
  publicId: string;
}

export function parseContentQueueMessage(body: unknown): ContentQueueMessage | null {
  if (!body || typeof body !== "object") return null;
  const { type, publicId } = body as Record<string, unknown>;
  if ((type !== "r2" && type !== "video") || typeof publicId !== "string") return null;
  if (!CONTENT_PUBLIC_ID_REGEX.test(publicId)) return null;
  return { type, publicId };
}

export type ContentJobKind = "video" | "audio" | "image" | "document" | "file";
export type ContentJobStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "blocked"
  | "deleted";

/** What the processor needs to know about an item. Never includes user data. */
export interface ContentJob {
  publicId: string;
  kind: ContentJobKind;
  status: ContentJobStatus;
  /** Only used by the mock classifier on staging */
  title: string;
  adult: boolean;
  allowDownload: boolean;
  /** Audio preview cut length, from previewConfig.seconds */
  previewSeconds: number | null;
  /** R2 jobs: the upload, `incoming/{publicId}/original.{ext}` */
  incomingKey: string | null;
  /** Declared and verified at completeUpload */
  mimeType: string | null;
  ext: string | null;
  /** Video jobs: short lived signed Stream thumbnail URLs */
  video: {
    durationMs: number | null;
    posterUrl: string;
    /** One frame every 5 seconds, at most 60 (spec 3.5 step 3.2) */
    keyframeUrls: string[];
  } | null;
}

/** Keys the processor writes. Every key starts with a served or quarantine prefix. */
export const CONTENT_OUTPUT_KEYS = {
  original: (publicId: string, ext: string) => `originals/${publicId}/original.${ext}`,
  audio: (publicId: string, variant: "full" | "preview") => `audio/${publicId}/${variant}.m4a`,
  derived: (publicId: string, role: string, file: string) => `derived/${publicId}/${role}/${file}`,
  quarantine: (publicId: string, ext: string) => `quarantine/${publicId}/original.${ext}`,
  /** Poster frame staged for the image tools, deleted with the rest of incoming/ */
  stagedPoster: (publicId: string) => `incoming/${publicId}/poster.jpg`,
} as const;

/** Spec 3.5 step 3.2: one keyframe per 5 seconds, at most 60. */
export function contentKeyframeTimes(durationMs: number | null): number[] {
  if (!durationMs || durationMs <= 0) return [0];
  const seconds = Math.floor(durationMs / 1000);
  const times: number[] = [];
  for (let t = 0; t <= seconds && times.length < 60; t += 5) times.push(t);
  return times;
}
