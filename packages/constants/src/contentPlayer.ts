/**
 * Shared media player and playback progress (Fan Library #26 phase A, content
 * system #20 spec 3.6). Used by the API (progress router, read URLs, captions),
 * the shared player in @repo/ui, and both apps.
 *
 * Times are milliseconds everywhere, as ContentItem.durationMs and chapters
 * (`startMs`) already are.
 */
import { z } from "zod";
import { contentPublicIdSchema } from "./content";
import { utf8Encode } from "./mediaToken";

export const CONTENT_PROGRESS = {
  /** The player writes position this often while playing, and on pause and hide */
  writeEveryMs: 10_000,
  /** Resume is offered from this far in ... */
  resumeMinMs: 30_000,
  /** ... until this share of the item has played */
  resumeMaxRatio: 0.95,
  /** Past this share an item counts as finished */
  completeRatio: 0.95,
  /** progress.set calls a viewer may make per item per minute */
  setPerMinute: 12,
  /** Longest position the API stores: 24 hours */
  maxPositionMs: 24 * 60 * 60 * 1000,
} as const;

/** Playback speeds offered by the player (fan library spec 3.5). */
export const PLAYER_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlayerSpeed = (typeof PLAYER_SPEEDS)[number];

/** Seek steps: arrows and j/l move 10 seconds; audio skip buttons move 15. */
export const PLAYER_SEEK_MS = 10_000;
export const PLAYER_SKIP_MS = 15_000;

export const contentProgressSetSchema = z.object({
  publicId: contentPublicIdSchema,
  positionMs: z.number().int().min(0).max(CONTENT_PROGRESS.maxPositionMs),
  durationMs: z.number().int().positive().max(CONTENT_PROGRESS.maxPositionMs).nullable().optional(),
  completed: z.boolean().default(false),
});
export type ContentProgressSetInput = z.infer<typeof contentProgressSetSchema>;

export const contentProgressGetSchema = z.object({ publicId: contentPublicIdSchema });

export interface ContentProgress {
  positionMs: number;
  durationMs: number | null;
  completed: boolean;
  updatedAt: string;
}

/**
 * Where to offer Resume, or null to start from the top. Offered from 30
 * seconds in and before 95 percent; a finished item starts over.
 */
export function contentResumePoint(
  progress: Pick<ContentProgress, "positionMs" | "durationMs" | "completed"> | null | undefined,
  durationMs?: number | null
): number | null {
  if (!progress || progress.completed) return null;
  const duration = durationMs ?? progress.durationMs ?? null;
  if (progress.positionMs < CONTENT_PROGRESS.resumeMinMs) return null;
  if (duration && progress.positionMs >= duration * CONTENT_PROGRESS.resumeMaxRatio) return null;
  return progress.positionMs;
}

/** True once a play has reached the finished share of the item. */
export function contentPlayCompleted(positionMs: number, durationMs: number | null | undefined) {
  return !!durationMs && positionMs >= durationMs * CONTENT_PROGRESS.completeRatio;
}

// ----------------------------------------------------------------------------
// Read URLs (spec 3.6). content.getReadUrl answers with this shape.
// ----------------------------------------------------------------------------

export const contentReadUrlSchema = z.object({
  publicId: contentPublicIdSchema,
  /** A single use download link instead of the viewing URLs (decision 24) */
  download: z.boolean().optional(),
});
export type ContentReadUrlInput = z.infer<typeof contentReadUrlSchema>;

export interface ContentImageSet {
  /** The largest rendition, for a plain img src */
  src: string;
  /** "{url} 320w, {url} 640w, ..." of the WebP renditions */
  srcSet: string;
  width: number | null;
  height: number | null;
}

export interface ContentCaptionTrack {
  lang: string;
  label: string;
  /** WebVTT through the gateway (audio). Video captions ride in the HLS manifest. */
  src: string | null;
}

export interface ContentPlayback {
  publicId: string;
  kind: "video" | "audio" | "image" | "document" | "file";
  /** Unix ms. The player asks again a minute before this. */
  expiresAt: number;
  cover: ContentImageSet | null;
  video: { hls: string; dash: string; poster: string | null } | null;
  audio: {
    src: string;
    mimeType: string;
    /** 1000 peaks from 0 to 1 as JSON */
    waveform: string | null;
  } | null;
  image: ContentImageSet | null;
  document: {
    format: "pdf" | "epub";
    /** The file for the in app viewer (PDF) */
    src: string | null;
    pageCount: number | null;
    /** Pages 1 to 3 as images */
    pages: string[];
  } | null;
  captions: ContentCaptionTrack[];
}

export interface ContentDownload {
  url: string;
  fileName: string;
  expiresAt: number;
}

// ----------------------------------------------------------------------------
// Captions (fan library spec 3.5): one WebVTT file per language.
// ----------------------------------------------------------------------------

export const CONTENT_CAPTIONS = {
  /** Languages per item */
  maxTracks: 5,
  /** Bytes of WebVTT per file */
  maxBytes: 512 * 1024,
} as const;

/** "en", "es", "pt-BR": BCP 47 language with an optional region. */
export const contentCaptionLangSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "Use a language code like en or pt-BR");

export const contentCaptionsSetSchema = z.object({
  publicId: contentPublicIdSchema,
  lang: contentCaptionLangSchema,
  vtt: z.string().min(6).max(CONTENT_CAPTIONS.maxBytes),
});

export const contentCaptionsRemoveSchema = z.object({
  publicId: contentPublicIdSchema,
  lang: contentCaptionLangSchema,
});

/**
 * A caption file the player can load: starts with WEBVTT (a byte order mark is
 * allowed), holds no NUL bytes and fits the size cap. Returns the file with
 * line endings normalized, or null.
 */
export function normalizeWebVtt(input: string): string | null {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(text)) return null;
  if (text.includes("\u0000")) return null;
  if (utf8Encode(text).length > CONTENT_CAPTIONS.maxBytes) return null;
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** "en" to "English", "pt-BR" to "Portuguese (Brazil)". */
export function captionLabel(lang: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}
