/**
 * Shared media player types (Fan Library #26 phase A, spec 3.5). The player knows
 * nothing about tRPC or the content system: the host app hands it a resolver for
 * signed sources and, for signed in viewers, a progress adapter.
 */

export interface PlayerChapter {
  startMs: number;
  title: string;
}

export interface PlayerCaption {
  lang: string;
  label: string;
  /** WebVTT URL for audio. Null for video, whose captions ride in the HLS manifest. */
  src: string | null;
}

/** A caption track the source offers: hls.js reads them from the manifest. */
export interface CaptionTrack {
  lang: string;
  label: string;
}

/** What is playing. Stable across source refreshes. */
export interface PlayerItem {
  /** The content publicId */
  id: string;
  kind: "video" | "audio";
  title: string;
  /** The creator, shown under the title and on the lock screen */
  subtitle?: string | null;
  /** Cover or poster for the mini player and Media Session */
  artwork?: string | null;
  durationMs?: number | null;
  chapters?: PlayerChapter[] | null;
  /** Where the mini player's expand goes */
  href?: string | null;
}

export type PlayerSource =
  | {
      kind: "video";
      /** Signed HLS manifest */
      hls: string;
      poster?: string | null;
      captions?: PlayerCaption[];
      /** Unix ms when the URLs stop working. Refreshed a minute before. */
      expiresAt: number;
    }
  | {
      kind: "audio";
      src: string;
      mimeType?: string | null;
      captions?: PlayerCaption[];
      waveform?: string | null;
      expiresAt: number;
    };

/** Fetches fresh signed URLs. Called on play and again before they expire. */
export type SourceResolver = () => Promise<PlayerSource>;

export interface PlayerProgressSnapshot {
  positionMs: number;
  durationMs: number | null;
  completed: boolean;
}

/** Where position is kept. Absent for signed out viewers: no resume. */
export interface ProgressAdapter {
  load(id: string): Promise<PlayerProgressSnapshot | null>;
  /** keepalive is true when the page is going away */
  save(id: string, snapshot: PlayerProgressSnapshot, options: { keepalive: boolean }): void;
}

export interface PlayerState {
  playing: boolean;
  /** Playback has started at least once for the current item */
  started: boolean;
  loading: boolean;
  error: "load" | "expired" | null;
  currentMs: number;
  durationMs: number | null;
  bufferedMs: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** Index into the current captions, or -1 for off */
  captionIndex: number;
  /** The caption text showing now (audio shows it under the player) */
  cueText: string;
  pip: boolean;
}

export const INITIAL_PLAYER_STATE: PlayerState = {
  playing: false,
  started: false,
  loading: false,
  error: null,
  currentMs: 0,
  durationMs: null,
  bufferedMs: 0,
  volume: 1,
  muted: false,
  rate: 1,
  captionIndex: -1,
  cueText: "",
  pip: false,
};
