/**
 * Content system (Build Board #20): which Cloudflare settings are present.
 * Spec 3.17. Uploads stay refused until the contentUploads flag is on AND every
 * setting the upload path needs exists, so a half configured environment answers
 * with a clear error instead of a broken upload. Video needs Stream on top of
 * that: without it every other kind still uploads to R2 (R2 only mode).
 */
import { env } from "../../env";
import { isFeatureOn } from "../featureFlags";

export interface ContentConfigStatus {
  ready: boolean;
  /** Names of missing settings. Never values. */
  missing: string[];
}

type EnvName = keyof typeof env;

const REQUIRED_FOR_UPLOADS = [
  "CF_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  // PR 4: without the queue an upload would wait in PROCESSING forever
  "CF_QUEUES_API_TOKEN",
  "CF_CONTENT_QUEUE_ID",
] as const satisfies readonly EnvName[];

/** Upload, signed playback and the ready webhook all need these. */
const REQUIRED_FOR_VIDEO = [
  "CF_STREAM_API_TOKEN",
  "CF_STREAM_KEY_ID",
  "CF_STREAM_KEY_PEM",
  "CF_STREAM_CUSTOMER_CODE",
  "CF_STREAM_WEBHOOK_SECRET",
] as const satisfies readonly EnvName[];

function configStatus(required: readonly EnvName[]): ContentConfigStatus {
  const missing = required.filter(name => !env[name]);
  return { ready: missing.length === 0, missing };
}

export function contentConfigStatus(): ContentConfigStatus {
  return configStatus(REQUIRED_FOR_UPLOADS);
}

/** Which Stream settings are present. Video stays closed while any is missing. */
export function streamConfigStatus(): ContentConfigStatus {
  return configStatus(REQUIRED_FOR_VIDEO);
}

/** True when the upload procedures may run. */
export function contentUploadsOpen(): boolean {
  return isFeatureOn("contentUploads") && contentConfigStatus().ready;
}

/** True when a video upload may start: uploads are open and Stream is configured. */
export function contentVideoUploadsOpen(): boolean {
  return contentUploadsOpen() && streamConfigStatus().ready;
}

/** Stream allowedOrigins: hostnames only, no scheme. */
export function streamAllowedOrigins(): string[] {
  return env.CF_STREAM_ALLOWED_ORIGINS.split(",")
    .map(item =>
      item
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
    )
    .filter(Boolean);
}

/** Upload limit in bytes per kind (spec 3.2). */
export function contentUploadLimitBytes(
  kind: "video" | "audio" | "image" | "document" | "file"
): number {
  const mb = {
    video: env.UPLOAD_LIMIT_CONTENT_VIDEO_MB,
    audio: env.UPLOAD_LIMIT_CONTENT_AUDIO_MB,
    image: env.UPLOAD_LIMIT_CONTENT_IMAGE_MB,
    document: env.UPLOAD_LIMIT_CONTENT_DOCUMENT_MB,
    file: env.UPLOAD_LIMIT_CONTENT_FILE_MB,
  }[kind];
  return Math.floor(mb * 1024 * 1024);
}
