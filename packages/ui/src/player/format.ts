/**
 * Pure helpers for the shared player. No DOM, so they run in tests and on the
 * server.
 */
import type { CaptionTrack, PlayerCaption, PlayerChapter } from "./types";

/** 0:42, 8:12, 1:02:03. Negative and missing values read as 0:00. */
export function formatClock(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** "8 minutes 12 seconds", for screen readers. */
export function spokenClock(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const parts = [
    hours ? part(hours, "hour") : "",
    minutes ? part(minutes, "minute") : "",
    seconds || (!hours && !minutes) ? part(seconds, "second") : "",
  ].filter(Boolean);
  return parts.join(" ");
}

/** Chapters sorted by start, without duplicates or starts past the end. */
export function normalizeChapters(
  chapters: PlayerChapter[] | null | undefined,
  durationMs?: number | null
): PlayerChapter[] {
  if (!chapters?.length) return [];
  const seen = new Set<number>();
  return [...chapters]
    .filter(chapter => chapter.startMs >= 0 && (!durationMs || chapter.startMs < durationMs))
    .sort((a, b) => a.startMs - b.startMs)
    .filter(chapter => (seen.has(chapter.startMs) ? false : (seen.add(chapter.startMs), true)));
}

/** The index of the chapter playing at `ms`, or -1 before the first. */
export function chapterIndexAt(chapters: PlayerChapter[], ms: number): number {
  let index = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i]!.startMs <= ms) index = i;
    else break;
  }
  return index;
}

/** Clamp a seek target into the item. */
export function clampSeek(ms: number, durationMs: number | null | undefined): number {
  const upper = durationMs && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  return Math.min(Math.max(0, ms), upper);
}

/** When to fetch fresh URLs: a minute before expiry, never sooner than 5 seconds from now. */
export function refreshDelayMs(expiresAt: number, now: number = Date.now()): number {
  return Math.max(5_000, expiresAt - now - 60_000);
}

/**
 * Decides whether a progress write is due. Writes while playing every
 * `everyMs`, and always when forced (pause, hide, end).
 */
export function progressWriteDue(
  lastWriteAt: number,
  now: number,
  everyMs: number,
  force = false
): boolean {
  return force || now - lastWriteAt >= everyMs;
}

/** The next caption choice when the CC button is pressed: off, then each track, then off. */
export function nextCaptionIndex(current: number, trackCount: number): number {
  if (trackCount === 0) return -1;
  return current + 1 >= trackCount ? -1 : current + 1;
}

/**
 * The track that carries the wanted caption: the same language first, then the
 * same language without its region, then the same label. hls.js names its
 * manifest tracks after the language, the API after the label.
 */
export function matchCaption(tracks: CaptionTrack[], wanted: PlayerCaption): number {
  const lang = wanted.lang.toLowerCase();
  const label = wanted.label.toLowerCase();
  const exact = tracks.findIndex(track => track.lang.toLowerCase() === lang);
  if (exact >= 0) return exact;
  const base = lang.split("-")[0];
  const sameBase = tracks.findIndex(
    track => track.lang.toLowerCase().split("-")[0] === base && base !== ""
  );
  if (sameBase >= 0) return sameBase;
  return tracks.findIndex(track => track.label.toLowerCase() === label);
}

/** The next speed in the list, wrapping to the first. */
export function nextSpeed(current: number, speeds: readonly number[]): number {
  const index = speeds.indexOf(current);
  return speeds[(index + 1) % speeds.length] ?? 1;
}

/** "1x", "1.25x", "0.75x" */
export function speedLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}x`;
}

/** Peaks from the processor's waveform file: an array of numbers from 0 to 1. */
export function parsePeaks(value: unknown, buckets = 120): number[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { peaks?: unknown }).peaks)
      ? ((value as { peaks: unknown[] }).peaks as unknown[])
      : [];
  const peaks = raw.map(n => (typeof n === "number" && Number.isFinite(n) ? n : 0));
  if (!peaks.length) return [];
  const size = Math.max(1, Math.floor(peaks.length / buckets));
  const out: number[] = [];
  for (let i = 0; i < peaks.length && out.length < buckets; i += size) {
    const slice = peaks.slice(i, i + size);
    out.push(Math.min(1, Math.max(0, Math.max(...slice))));
  }
  return out;
}
