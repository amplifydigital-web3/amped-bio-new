/**
 * File helpers for the Content library (spec 3.2 limits, 3.5 step 1, cs2).
 * The browser checks kind, size, storage and video minutes before any byte
 * leaves the device (acceptance 7). The server repeats every check at
 * createUpload and reads the real type from the first 4 KB at completeUpload,
 * so these checks are for a fast, clear answer, not for trust.
 */
import {
  CONTENT_ALLOWED_TYPES,
  CONTENT_UPLOAD_KINDS,
  contentExtensionOf,
  type ContentUploadKind,
} from "@repo/constants";
import { CONTENT_COPY } from "../copy";

/** The storage numbers the upload checks need, as content.getStorage returns them. */
export interface StorageSnapshot {
  bytesLimit: number;
  bytesUsed: number;
  bytesReserved: number;
  videoMinutesLimit: number;
  videoMinutesUsed: number;
  limits: Record<ContentUploadKind, number>;
}

/** The kind a file belongs to, from its extension. Null when no kind takes it. */
export function kindForFile(fileName: string): ContentUploadKind | null {
  const ext = contentExtensionOf(fileName);
  if (!ext) return null;
  return CONTENT_UPLOAD_KINDS.find(kind => CONTENT_ALLOWED_TYPES[kind].exts.includes(ext)) ?? null;
}

// Canonical MIME per extension, for files the browser leaves untyped (mkv,
// heic, epub and flac often arrive with an empty or vendor type)
const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  pdf: "application/pdf",
  epub: "application/epub+zip",
  zip: "application/zip",
};

/**
 * The MIME type sent to createUpload. The browser's type is kept when the kind
 * allows it; otherwise the canonical type for the extension is used, so a WAV
 * the browser calls audio/vnd.wave still uploads as audio/wav.
 */
export function mimeForFile(file: Pick<File, "name" | "type">, kind: ContentUploadKind): string {
  const browser = file.type.split(";")[0]!.trim().toLowerCase();
  if (browser && CONTENT_ALLOWED_TYPES[kind].mimes.includes(browser)) return browser;
  return MIME_BY_EXT[contentExtensionOf(file.name)] ?? browser;
}

/** Title from the file name, as the server would default it. */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
  return (base || "Untitled").slice(0, 140);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * 1.4 GB, 450 MB, 4.2 MB. Binary units, as the server computes quotas and
 * limits (MB times 1024 times 1024), so 5120 MB on the plan reads as 5 GB.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes >= GB) {
    const value = bytes / GB;
    return `${Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2))} GB`;
  }
  const value = bytes / MB;
  if (value < 0.1) return "0.1 MB";
  return `${Number(value.toFixed(value >= 100 ? 0 : 1))} MB`;
}

/** Limits are whole MB on the server; show them as 2 GB, 500 MB. */
export function formatLimit(bytes: number): string {
  return formatBytes(bytes);
}

/** 12:40, 1:02:05. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "6:12" or "1:02:05" to milliseconds. Null when the text is not a time. */
export function parseTimecode(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(trimmed)) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.slice(1).some(n => n > 59)) return null;
  const seconds = parts.reduce((acc, n) => acc * 60 + n, 0);
  return seconds * 1000;
}

/** Space the server will accept: limit minus used minus in flight reservations. */
export function bytesLeft(storage: StorageSnapshot): number {
  return Math.max(0, storage.bytesLimit - storage.bytesUsed - storage.bytesReserved);
}

export function minutesLeft(storage: StorageSnapshot): number {
  return Math.max(0, storage.videoMinutesLimit - storage.videoMinutesUsed);
}

export type Preflight =
  | { ok: true; kind: ContentUploadKind; mimeType: string }
  | { ok: false; kind: ContentUploadKind | null; reason: string };

/**
 * Checks one file against the limits before it is queued. `pendingBytes` and
 * `pendingMinutes` are what earlier files in the same batch will take, so a
 * batch that overflows is refused file by file, before any bytes are sent.
 */
export function preflightFile(
  file: Pick<File, "name" | "type" | "size">,
  storage: StorageSnapshot,
  pending: { bytes: number; minutes: number },
  durationSec?: number
): Preflight {
  const kind = kindForFile(file.name);
  if (!kind) return { ok: false, kind: null, reason: CONTENT_COPY.errors.unsupported };
  const mimeType = mimeForFile(file, kind);
  if (!CONTENT_ALLOWED_TYPES[kind].mimes.includes(mimeType)) {
    return { ok: false, kind, reason: CONTENT_COPY.errors.unsupported };
  }
  if (file.size <= 0) return { ok: false, kind, reason: CONTENT_COPY.errors.empty };
  const limit = storage.limits[kind];
  if (file.size > limit) {
    return { ok: false, kind, reason: CONTENT_COPY.errors.tooLarge(formatLimit(limit)) };
  }
  // The server reserves bytes for every kind, video included, at createUpload
  if (file.size > bytesLeft(storage) - pending.bytes) {
    return { ok: false, kind, reason: CONTENT_COPY.errors.noStorage };
  }
  // Video also counts minutes (spec 3.3)
  if (kind === "video") {
    const left = minutesLeft(storage) - pending.minutes;
    if (left <= 0) return { ok: false, kind, reason: CONTENT_COPY.errors.noMinutes };
    if (durationSec && Math.ceil(durationSec / 60) > left) {
      return { ok: false, kind, reason: CONTENT_COPY.errors.tooLong };
    }
  }
  return { ok: true, kind, mimeType };
}

/**
 * Reads a video's length from its metadata, for the minutes check at
 * createUpload. Resolves undefined when the browser can not read it (an MKV
 * in Safari, for example); the server then checks minutes when Stream reports
 * the duration.
 */
export function readVideoDuration(file: File, timeoutMs = 8000): Promise<number | undefined> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(undefined);
  }
  return new Promise(resolve => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (value: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => finish(undefined);
    video.src = url;
  });
}
