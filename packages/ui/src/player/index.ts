// Shared media player (Fan Library #26 phase A). docs/features/fan-library.md
export { PlayerProvider, usePlayer, useOptionalPlayer } from "./PlayerProvider";
export type { PlayerApi, LoadOptions } from "./PlayerProvider";
export { MediaPlayer, ChapterList, handlePlayerKey } from "./MediaPlayer";
export type { MediaPlayerProps } from "./MediaPlayer";
export { MiniPlayer } from "./MiniPlayer";
export { PLAYER_COPY } from "./copy";
export * from "./format";
export * from "./types";
export { playbackToSource, requirePlayerSource } from "./content";
