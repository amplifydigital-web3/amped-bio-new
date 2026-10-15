/**
 * Content system (Build Board #20): which Cloudflare settings are present.
 * Spec 3.17. Uploads stay refused until CONTENT_UPLOADS_ENABLED is on AND every
 * setting the upload path needs exists, so a half configured environment answers
 * with a clear error instead of a broken upload.
 */
import { env } from "../../env";

export interface ContentConfigStatus {
  ready: boolean;
  /** Names of missing settings. Never values. */
  missing: string[];
}

const REQUIRED_FOR_UPLOADS = [
  "CF_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "CF_STREAM_API_TOKEN",
] as const;

export function contentConfigStatus(): ContentConfigStatus {
  const missing = REQUIRED_FOR_UPLOADS.filter(name => !env[name]);
  return { ready: missing.length === 0, missing };
}

/** True when the upload procedures may run. */
export function contentUploadsOpen(): boolean {
  return env.CONTENT_UPLOADS_ENABLED && contentConfigStatus().ready;
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
