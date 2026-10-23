"use client";

/**
 * The one media element per page (Fan Library #26 phase A, spec 3.5).
 *
 * Mounted once in the editor shell and in the public site layout. It owns a
 * <video> and an <audio> element that never unmount, so play continues while
 * the viewer moves between screens: the full player borrows the video element
 * by moving it into its slot, and hands it back on unmount, where the mini
 * player takes over. A media element moved within the document keeps playing.
 *
 * It also keeps position for signed in viewers (every 10 seconds of play, on
 * pause, on hide and on leave), refreshes signed URLs a minute before they
 * expire, and drives the lock screen through the Media Session API.
 */
import * as React from "react";
import {
  CONTENT_PROGRESS,
  PLAYER_SEEK_MS,
  PLAYER_SPEEDS,
  contentPlayCompleted,
} from "@repo/constants";
import { attachSource, type Attachment } from "./attach";
import { clampSeek, nextCaptionIndex, nextSpeed, progressWriteDue, refreshDelayMs } from "./format";
import {
  INITIAL_PLAYER_STATE,
  type PlayerCaption,
  type PlayerItem,
  type PlayerProgressSnapshot,
  type PlayerSource,
  type PlayerState,
  type ProgressAdapter,
  type SourceResolver,
} from "./types";

export interface LoadOptions {
  /** Start here instead of the top (Resume) */
  startAtMs?: number | null;
  autoplay?: boolean;
}

export interface PlayerApi {
  item: PlayerItem | null;
  source: PlayerSource | null;
  state: PlayerState;
  captions: PlayerCaption[];
  /** A full player for the current item is on screen */
  fullPlayerShowing: boolean;
  airplayAvailable: boolean;
  pipSupported: boolean;
  /** The viewer has a progress store (signed in) */
  tracksProgress: boolean;
  load(item: PlayerItem, resolve: SourceResolver, options?: LoadOptions): Promise<void>;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  skip(deltaMs: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  cycleRate(): void;
  cycleCaptions(): void;
  togglePip(): void;
  showAirplay(): void;
  toggleFullscreen(container: HTMLElement | null): void;
  retry(): void;
  close(): void;
  /** The full player's video well; null on unmount */
  registerSlot(itemId: string, element: HTMLElement | null): void;
  loadProgress(id: string): Promise<PlayerProgressSnapshot | null>;
}

const PlayerContext = React.createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const api = React.useContext(PlayerContext);
  if (!api) throw new Error("usePlayer needs a PlayerProvider above it");
  return api;
}

/** For components that render with or without a provider (the mini player). */
export function useOptionalPlayer(): PlayerApi | null {
  return React.useContext(PlayerContext);
}

type MediaEl = HTMLMediaElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitEnterFullscreen?: () => void;
};

interface Current {
  item: PlayerItem;
  resolve: SourceResolver;
  source: PlayerSource | null;
}

function setSessionMetadata(item: PlayerItem | null) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    if (!item) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.subtitle ?? "",
      artwork: item.artwork ? [{ src: item.artwork, sizes: "512x512" }] : [],
    });
  } catch {
    // Media Session is best effort
  }
}

export function PlayerProvider({
  children,
  progress = null,
}: {
  children: React.ReactNode;
  progress?: ProgressAdapter | null;
}) {
  const parkingRef = React.useRef<HTMLDivElement | null>(null);
  const videoRef = React.useRef<MediaEl | null>(null);
  const audioRef = React.useRef<MediaEl | null>(null);
  const currentRef = React.useRef<Current | null>(null);
  const attachmentRef = React.useRef<Attachment | null>(null);
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotRef = React.useRef<{ itemId: string; element: HTMLElement } | null>(null);
  const lastWriteRef = React.useRef(0);
  const lastSessionPosRef = React.useRef(0);
  const progressRef = React.useRef(progress);
  progressRef.current = progress;
  const stateRef = React.useRef<PlayerState>(INITIAL_PLAYER_STATE);
  const loadToken = React.useRef(0);

  const [state, setStateRaw] = React.useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [current, setCurrent] = React.useState<Current | null>(null);
  const [fullPlayerShowing, setFullPlayerShowing] = React.useState(false);
  const [airplayAvailable, setAirplayAvailable] = React.useState(false);
  const [pipSupported, setPipSupported] = React.useState(false);

  const setState = React.useCallback((patch: Partial<PlayerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setStateRaw(stateRef.current);
  }, []);

  const active = React.useCallback((): MediaEl | null => {
    const item = currentRef.current?.item;
    if (!item) return null;
    return item.kind === "video" ? videoRef.current : audioRef.current;
  }, []);

  // ---------------------------------------------------------------- progress

  const writeProgress = React.useCallback(
    (force: boolean, keepalive = false) => {
      const adapter = progressRef.current;
      const item = currentRef.current?.item;
      const media = active();
      if (!adapter || !item || !media || !stateRef.current.started) return;
      const now = Date.now();
      if (!progressWriteDue(lastWriteRef.current, now, CONTENT_PROGRESS.writeEveryMs, force)) {
        return;
      }
      lastWriteRef.current = now;
      const positionMs = Math.round(media.currentTime * 1000);
      const durationMs = Number.isFinite(media.duration)
        ? Math.round(media.duration * 1000)
        : (item.durationMs ?? null);
      try {
        adapter.save(
          item.id,
          {
            positionMs,
            durationMs,
            completed: media.ended || contentPlayCompleted(positionMs, durationMs),
          },
          { keepalive }
        );
      } catch {
        // Progress is best effort; playback never stops for it
      }
    },
    [active]
  );

  // ---------------------------------------------------------------- captions

  const applyCaptions = React.useCallback(
    (index: number) => {
      const media = active();
      const captions = currentRef.current?.source?.captions ?? [];
      if (!media) return;
      const wanted = index >= 0 ? captions[index] : undefined;
      const tracks = Array.from(media.textTracks ?? []);
      let showing: TextTrack | null = null;
      for (const track of tracks) {
        const match = wanted && (track.language === wanted.lang || track.label === wanted.label);
        if (match && !showing) {
          // Video draws captions over the picture; audio shows the cue under the player
          track.mode = media === videoRef.current ? "showing" : "hidden";
          showing = track;
        } else {
          track.mode = "disabled";
        }
      }
      const readCue = () => {
        const cue = showing?.activeCues?.[0] as (TextTrackCue & { text?: string }) | undefined;
        setState({ cueText: cue?.text ?? "" });
      };
      if (showing) showing.oncuechange = readCue;
      setState({ captionIndex: wanted ? index : -1, cueText: "" });
    },
    [active, setState]
  );

  // ---------------------------------------------------------------- elements

  React.useEffect(() => {
    const parking = parkingRef.current;
    if (!parking) return;
    const video = document.createElement("video") as HTMLVideoElement & MediaEl;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("x-webkit-airplay", "allow");
    video.className = "h-full w-full bg-black object-contain";
    const audio = document.createElement("audio") as MediaEl;
    audio.preload = "metadata";
    parking.append(video, audio);
    videoRef.current = video;
    audioRef.current = audio;
    setPipSupported(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        !!(document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled
    );

    const onEvent = (media: MediaEl) => (event: Event) => {
      if (active() !== media) return;
      switch (event.type) {
        case "play":
          setState({ playing: true, started: true, error: null });
          break;
        case "playing":
          setState({ loading: false });
          break;
        case "pause":
          setState({ playing: false });
          writeProgress(true);
          break;
        case "waiting":
          setState({ loading: true });
          break;
        case "canplay":
          setState({ loading: false });
          break;
        case "ended":
          setState({ playing: false });
          writeProgress(true);
          break;
        case "durationchange":
          if (Number.isFinite(media.duration)) {
            setState({ durationMs: Math.round(media.duration * 1000) });
          }
          break;
        case "progress":
          if (media.buffered.length) {
            setState({
              bufferedMs: Math.round(media.buffered.end(media.buffered.length - 1) * 1000),
            });
          }
          break;
        case "volumechange":
          setState({ volume: media.volume, muted: media.muted });
          break;
        case "ratechange":
          setState({ rate: media.playbackRate });
          break;
        case "timeupdate": {
          const ms = Math.round(media.currentTime * 1000);
          setState({ currentMs: ms });
          if (!media.paused) writeProgress(false);
          const now = Date.now();
          if (now - lastSessionPosRef.current > 5000 && "mediaSession" in navigator) {
            lastSessionPosRef.current = now;
            try {
              if (Number.isFinite(media.duration) && media.duration > 0) {
                navigator.mediaSession.setPositionState({
                  duration: media.duration,
                  position: Math.min(media.currentTime, media.duration),
                  playbackRate: media.playbackRate,
                });
              }
            } catch {
              // Not every browser takes position state
            }
          }
          break;
        }
        case "error":
          setState({ error: "load", loading: false, playing: false });
          break;
        case "enterpictureinpicture":
          setState({ pip: true });
          break;
        case "leavepictureinpicture":
          setState({ pip: false });
          break;
        case "loadedmetadata": {
          // Video captions arrive with the manifest; keep the choice once tracks exist
          const index = stateRef.current.captionIndex;
          if (index >= 0) applyCaptions(index);
          break;
        }
      }
    };
    const events = [
      "play",
      "playing",
      "pause",
      "waiting",
      "canplay",
      "ended",
      "durationchange",
      "progress",
      "volumechange",
      "ratechange",
      "timeupdate",
      "error",
      "enterpictureinpicture",
      "leavepictureinpicture",
      "loadedmetadata",
    ];
    const videoHandler = onEvent(video);
    const audioHandler = onEvent(audio);
    events.forEach(name => {
      video.addEventListener(name, videoHandler);
      audio.addEventListener(name, audioHandler);
    });
    const onAirplay = (event: Event) =>
      setAirplayAvailable(
        (event as Event & { availability?: string }).availability === "available"
      );
    video.addEventListener("webkitplaybacktargetavailabilitychanged", onAirplay);

    return () => {
      events.forEach(name => {
        video.removeEventListener(name, videoHandler);
        audio.removeEventListener(name, audioHandler);
      });
      video.removeEventListener("webkitplaybacktargetavailabilitychanged", onAirplay);
      attachmentRef.current?.detach();
      video.remove();
      audio.remove();
    };
  }, [active, applyCaptions, setState, writeProgress]);

  // Save on hide and on leave, while the page can still send
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") writeProgress(true, true);
    };
    const onLeave = () => writeProgress(true, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [writeProgress]);

  // ---------------------------------------------------------------- source

  const clearRefresh = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
  };

  const scheduleRefresh = React.useCallback(
    (expiresAt: number, token: number) => {
      clearRefresh();
      refreshTimer.current = setTimeout(async () => {
        const now = currentRef.current;
        if (!now || loadToken.current !== token) return;
        try {
          const next = await now.resolve();
          if (loadToken.current !== token) return;
          await attachmentRef.current?.swap(next);
          currentRef.current = { ...now, source: next };
          setCurrent(currentRef.current);
          scheduleRefresh(next.expiresAt, token);
        } catch {
          // Access may have ended (a fan who lost access finishes this play only)
          setState({ error: "expired" });
        }
      }, refreshDelayMs(expiresAt));
    },
    [setState]
  );

  const placeVideo = React.useCallback(() => {
    const video = videoRef.current;
    const parking = parkingRef.current;
    const item = currentRef.current?.item;
    if (!video || !parking) return;
    const slot = slotRef.current;
    if (item?.kind === "video" && slot && slot.itemId === item.id) {
      if (video.parentElement !== slot.element) slot.element.appendChild(video);
      setFullPlayerShowing(true);
    } else {
      if (video.parentElement !== parking) parking.appendChild(video);
      setFullPlayerShowing(!!slot && !!item && slot.itemId === item.id);
    }
  }, []);

  const teardown = React.useCallback(() => {
    writeProgress(true);
    clearRefresh();
    const media = active();
    media?.pause();
    attachmentRef.current?.detach();
    attachmentRef.current = null;
  }, [active, writeProgress]);

  const load = React.useCallback(
    async (item: PlayerItem, resolve: SourceResolver, options: LoadOptions = {}) => {
      const existing = currentRef.current;
      const media0 = item.kind === "video" ? videoRef.current : audioRef.current;
      if (existing && existing.item.id === item.id && attachmentRef.current && media0) {
        if (options.startAtMs != null) media0.currentTime = options.startAtMs / 1000;
        if (options.autoplay) void media0.play().catch(() => {});
        return;
      }
      if (existing) teardown();
      const token = ++loadToken.current;
      currentRef.current = { item, resolve, source: null };
      setCurrent(currentRef.current);
      lastWriteRef.current = Date.now();
      setState({
        ...INITIAL_PLAYER_STATE,
        volume: stateRef.current.volume,
        muted: stateRef.current.muted,
        rate: stateRef.current.rate,
        loading: true,
        currentMs: options.startAtMs ?? 0,
        durationMs: item.durationMs ?? null,
      });
      setSessionMetadata(item);
      placeVideo();

      const media = item.kind === "video" ? videoRef.current : audioRef.current;
      if (!media) return;
      let source: PlayerSource;
      try {
        source = await resolve();
      } catch {
        if (loadToken.current === token) setState({ error: "load", loading: false });
        return;
      }
      if (loadToken.current !== token) return;
      currentRef.current = { item, resolve, source };
      setCurrent(currentRef.current);
      if (source.kind === "video" && source.poster) media.setAttribute("poster", source.poster);
      else media.removeAttribute("poster");
      attachmentRef.current = await attachSource(media, source, () =>
        setState({ error: "load", loading: false, playing: false })
      );
      if (loadToken.current !== token) return;
      media.playbackRate = stateRef.current.rate;
      media.volume = stateRef.current.volume;
      media.muted = stateRef.current.muted;
      if (options.startAtMs) {
        const at = options.startAtMs / 1000;
        if (media.readyState >= 1) media.currentTime = at;
        else
          media.addEventListener("loadedmetadata", () => (media.currentTime = at), { once: true });
      }
      scheduleRefresh(source.expiresAt, token);
      if (options.autoplay) {
        setState({ started: true });
        await media.play().catch(() => setState({ playing: false, loading: false }));
      } else {
        setState({ loading: false });
      }
    },
    [placeVideo, scheduleRefresh, setState, teardown]
  );

  // ---------------------------------------------------------------- controls

  const play = React.useCallback(() => {
    const media = active();
    if (!media) return;
    setState({ started: true });
    void media.play().catch(() => setState({ playing: false }));
  }, [active, setState]);

  const pause = React.useCallback(() => active()?.pause(), [active]);

  const toggle = React.useCallback(() => {
    const media = active();
    if (!media) return;
    if (media.paused) play();
    else media.pause();
  }, [active, play]);

  const seek = React.useCallback(
    (ms: number) => {
      const media = active();
      if (!media) return;
      const duration = Number.isFinite(media.duration) ? media.duration * 1000 : null;
      const target = clampSeek(ms, duration);
      media.currentTime = target / 1000;
      setState({ currentMs: target });
      writeProgress(true);
    },
    [active, setState, writeProgress]
  );

  const skip = React.useCallback(
    (deltaMs: number) => {
      const media = active();
      if (media) seek(media.currentTime * 1000 + deltaMs);
    },
    [active, seek]
  );

  const setVolume = React.useCallback(
    (volume: number) => {
      const media = active();
      if (!media) return;
      media.volume = Math.min(1, Math.max(0, volume));
      if (media.volume > 0) media.muted = false;
    },
    [active]
  );

  const toggleMute = React.useCallback(() => {
    const media = active();
    if (media) media.muted = !media.muted;
  }, [active]);

  const cycleRate = React.useCallback(() => {
    const media = active();
    if (!media) return;
    media.playbackRate = nextSpeed(media.playbackRate, PLAYER_SPEEDS);
  }, [active]);

  const cycleCaptions = React.useCallback(() => {
    const count = currentRef.current?.source?.captions?.length ?? 0;
    applyCaptions(nextCaptionIndex(stateRef.current.captionIndex, count));
  }, [applyCaptions]);

  const togglePip = React.useCallback(() => {
    const video = videoRef.current as (HTMLVideoElement & MediaEl) | null;
    if (!video || currentRef.current?.item.kind !== "video") return;
    const doc = document as Document & {
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    if (doc.pictureInPictureElement) void doc.exitPictureInPicture?.().catch(() => {});
    else void video.requestPictureInPicture?.().catch(() => {});
  }, []);

  const showAirplay = React.useCallback(() => {
    videoRef.current?.webkitShowPlaybackTargetPicker?.();
  }, []);

  const toggleFullscreen = React.useCallback((container: HTMLElement | null) => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
      return;
    }
    if (container?.requestFullscreen) {
      void container.requestFullscreen().catch(() => videoRef.current?.webkitEnterFullscreen?.());
    } else {
      // iOS Safari: only the video element itself goes full screen
      videoRef.current?.webkitEnterFullscreen?.();
    }
  }, []);

  const retry = React.useCallback(() => {
    const now = currentRef.current;
    if (!now) return;
    const at = active()?.currentTime ?? 0;
    teardown();
    currentRef.current = null;
    void load(now.item, now.resolve, { startAtMs: Math.round(at * 1000), autoplay: true });
  }, [active, load, teardown]);

  const close = React.useCallback(() => {
    teardown();
    loadToken.current += 1;
    currentRef.current = null;
    setCurrent(null);
    setState(INITIAL_PLAYER_STATE);
    setSessionMetadata(null);
    placeVideo();
  }, [placeVideo, setState, teardown]);

  const registerSlot = React.useCallback(
    (itemId: string, element: HTMLElement | null) => {
      if (element) slotRef.current = { itemId, element };
      else if (slotRef.current?.itemId === itemId) slotRef.current = null;
      placeVideo();
    },
    [placeVideo]
  );

  const loadProgress = React.useCallback(async (id: string) => {
    const adapter = progressRef.current;
    if (!adapter) return null;
    try {
      return await adapter.load(id);
    } catch {
      return null;
    }
  }, []);

  // Lock screen and headset controls
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => play()],
      ["pause", () => pause()],
      ["seekbackward", details => skip(-(details.seekOffset ?? PLAYER_SEEK_MS / 1000) * 1000)],
      ["seekforward", details => skip((details.seekOffset ?? PLAYER_SEEK_MS / 1000) * 1000)],
      ["seekto", details => details.seekTime != null && seek(details.seekTime * 1000)],
      ["stop", () => close()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Unsupported action
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Unsupported action
        }
      }
    };
  }, [close, pause, play, seek, skip]);

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = current
      ? state.playing
        ? "playing"
        : "paused"
      : "none";
  }, [current, state.playing]);

  const api: PlayerApi = {
    item: current?.item ?? null,
    source: current?.source ?? null,
    state,
    captions: current?.source?.captions ?? [],
    fullPlayerShowing,
    airplayAvailable,
    pipSupported,
    tracksProgress: !!progress,
    load,
    play,
    pause,
    toggle,
    seek,
    skip,
    setVolume,
    toggleMute,
    cycleRate,
    cycleCaptions,
    togglePip,
    showAirplay,
    toggleFullscreen,
    retry,
    close,
    registerSlot,
    loadProgress,
  };

  return (
    <PlayerContext.Provider value={api}>
      {children}
      <div ref={parkingRef} hidden aria-hidden data-amped-player-parking="" />
    </PlayerContext.Provider>
  );
}
