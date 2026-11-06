/**
 * Bridges the content system's read URLs (content.getReadUrl, spec 3.6) to the
 * player. Both apps use it, so the editor preview and the public pages play the
 * same way.
 */
import type { ContentPlayback } from "@repo/constants";
import type { PlayerSource } from "./types";

/** The player source for a video or audio item, or null for other kinds. */
export function playbackToSource(playback: ContentPlayback): PlayerSource | null {
  if (playback.video) {
    return {
      kind: "video",
      hls: playback.video.hls,
      poster: playback.video.poster,
      captions: playback.captions,
      expiresAt: playback.expiresAt,
    };
  }
  if (playback.audio) {
    return {
      kind: "audio",
      src: playback.audio.src,
      mimeType: playback.audio.mimeType,
      waveform: playback.audio.waveform,
      captions: playback.captions,
      expiresAt: playback.expiresAt,
    };
  }
  return null;
}

/**
 * Thrown by a source resolver when the server refused the fan (Fan Library
 * FL-6, spec 3.4): the player stops and shows Access ended instead of a retry.
 */
export class AccessEndedError extends Error {
  constructor() {
    super("Access ended");
    this.name = "AccessEndedError";
  }
}

export function isAccessEnded(error: unknown): boolean {
  return error instanceof AccessEndedError || (error as Error | null)?.name === "AccessEndedError";
}

/** Throws when the item has nothing to play, so the player shows its error. */
export function requirePlayerSource(playback: ContentPlayback | null | undefined): PlayerSource {
  const source = playback ? playbackToSource(playback) : null;
  if (!source) throw new Error("This item has nothing to play");
  return source;
}
