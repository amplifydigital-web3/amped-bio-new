"use client";

/**
 * The full player (Fan Library #26 phase A, boards fl8 and fl10; content system
 * board cs7). One component for every surface that plays an item: the public
 * item page, the content block's featured item and the editor's preview.
 *
 * The chrome is media dark on every surface, as players are: it sits on the
 * creator's theme on public pages and on Prism glass in the editor without
 * borrowing either. Every control is at least 44 square, labelled, and works
 * from the keyboard: space or k, left and right or j and l, up and down, f, m, c.
 */
import * as React from "react";
import {
  Airplay,
  Captions,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { PLAYER_SEEK_MS, PLAYER_SKIP_MS, contentResumePoint } from "@repo/constants";
import { cn } from "../utils";
import { PLAYER_COPY as copy } from "./copy";
import {
  chapterIndexAt,
  formatClock,
  normalizeChapters,
  parsePeaks,
  speedLabel,
  spokenClock,
} from "./format";
import { usePlayer, type PlayerApi } from "./PlayerProvider";
import type { PlayerItem, SourceResolver } from "./types";

export interface MediaPlayerProps {
  item: PlayerItem;
  resolve: SourceResolver;
  /** Shown before play: the cover or poster */
  poster?: string | null;
  /** Offer Resume and Start over when the viewer has a saved position */
  showResume?: boolean;
  className?: string;
  /** Called the first time this item starts playing (analytics) */
  onStart?: () => void;
}

const ICON_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40";

function IconButton({
  label,
  pressed,
  onClick,
  children,
  className,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(ICON_BTN, className)}
    >
      {children}
    </button>
  );
}

/** Keyboard shortcuts (fan library spec 3.5). Returns true when handled. */
export function handlePlayerKey(
  event: Pick<KeyboardEvent, "key" | "target">,
  player: PlayerApi,
  container: HTMLElement | null
): boolean {
  const target = event.target as HTMLElement | null;
  const onRange = target instanceof HTMLInputElement && target.type === "range";
  const onButton = target instanceof HTMLButtonElement;
  switch (event.key) {
    case " ":
    case "k":
      if (onButton && event.key === " ") return false;
      player.toggle();
      return true;
    case "ArrowLeft":
    case "j":
      if (onRange && event.key === "ArrowLeft") return false;
      player.skip(-PLAYER_SEEK_MS);
      return true;
    case "ArrowRight":
    case "l":
      if (onRange && event.key === "ArrowRight") return false;
      player.skip(PLAYER_SEEK_MS);
      return true;
    case "ArrowUp":
      if (onRange) return false;
      player.setVolume(player.state.volume + 0.1);
      return true;
    case "ArrowDown":
      if (onRange) return false;
      player.setVolume(player.state.volume - 0.1);
      return true;
    case "f":
      if (player.item?.kind !== "video") return false;
      player.toggleFullscreen(container);
      return true;
    case "m":
      player.toggleMute();
      return true;
    case "c":
      if (!player.captions.length) return false;
      player.cycleCaptions();
      return true;
    default:
      return false;
  }
}

function SeekBar({
  player,
  durationMs,
  chapters,
  hideTrack = false,
}: {
  player: PlayerApi;
  durationMs: number | null;
  chapters: ReturnType<typeof normalizeChapters>;
  /** The audio waveform draws the track instead */
  hideTrack?: boolean;
}) {
  const total = durationMs ?? 0;
  const current = Math.min(player.state.currentMs, total || player.state.currentMs);
  const played = total ? (current / total) * 100 : 0;
  const buffered = total ? Math.min(100, (player.state.bufferedMs / total) * 100) : 0;
  return (
    <div className="relative flex h-11 w-full items-center">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25",
          hideTrack && "opacity-0"
        )}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/40"
          style={{ width: `${buffered}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white"
          style={{ width: `${played}%` }}
        />
        {total > 0 &&
          chapters
            .filter(chapter => chapter.startMs > 0)
            .map(chapter => (
              <span
                key={chapter.startMs}
                aria-hidden
                className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 bg-black/70"
                style={{ left: `${(chapter.startMs / total) * 100}%` }}
              />
            ))}
      </div>
      <input
        type="range"
        aria-label={copy.seek}
        aria-valuetext={copy.seekValue(spokenClock(current), spokenClock(total))}
        min={0}
        max={Math.max(total, 1)}
        step={1000}
        value={current}
        disabled={!total}
        onClick={event => event.stopPropagation()}
        onChange={event => player.seek(Number(event.target.value))}
        className="relative h-11 w-full cursor-pointer appearance-none bg-transparent outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-white [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  );
}

function ResumeRow({
  resumeAt,
  onResume,
  onStartOver,
}: {
  resumeAt: number;
  onResume: () => void;
  onStartOver: () => void;
}) {
  return (
    <div className="mt-[13px] flex flex-wrap gap-[13px]">
      <button
        type="button"
        onClick={onResume}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-[21px] text-[16px] font-semibold text-[#16152B] outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Play className="h-5 w-5" aria-hidden />
        {copy.resumeAt(formatClock(resumeAt))}
      </button>
      <button
        type="button"
        onClick={onStartOver}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-current px-[21px] text-[16px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-5 w-5" aria-hidden />
        {copy.startOver}
      </button>
    </div>
  );
}

/** Saved position for this item, once per mount (signed in viewers only). */
function useResumePoint(player: PlayerApi, item: PlayerItem, enabled: boolean) {
  const [resumeAt, setResumeAt] = React.useState<number | null>(null);
  const { loadProgress, tracksProgress } = player;
  React.useEffect(() => {
    if (!enabled || !tracksProgress) return;
    let live = true;
    void loadProgress(item.id).then(snapshot => {
      if (live) setResumeAt(contentResumePoint(snapshot, item.durationMs));
    });
    return () => {
      live = false;
    };
  }, [enabled, tracksProgress, loadProgress, item.id, item.durationMs]);
  return resumeAt;
}

export function MediaPlayer(props: MediaPlayerProps) {
  return props.item.kind === "audio" ? <AudioPlayer {...props} /> : <VideoPlayer {...props} />;
}

function useStart(props: MediaPlayerProps, player: PlayerApi) {
  const started = React.useRef(false);
  return React.useCallback(
    (startAtMs: number | null) => {
      if (!started.current) {
        started.current = true;
        props.onStart?.();
      }
      void player.load(props.item, props.resolve, { autoplay: true, startAtMs });
    },
    [player, props]
  );
}

// ------------------------------------------------------------------- video

function VideoPlayer(props: MediaPlayerProps) {
  const { item, poster, showResume = true, className } = props;
  const player = usePlayer();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const isCurrent = player.item?.id === item.id;
  const state = player.state;
  const live = isCurrent && state.started;
  const chapters = normalizeChapters(item.chapters, state.durationMs ?? item.durationMs);
  const durationMs = (isCurrent ? state.durationMs : null) ?? item.durationMs ?? null;
  const resumeAt = useResumePoint(player, item, showResume);
  const start = useStart(props, player);
  const [chrome, setChrome] = React.useState(true);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);

  const { registerSlot } = player;
  const slot = React.useCallback(
    (element: HTMLDivElement | null) => registerSlot(item.id, element),
    [registerSlot, item.id]
  );

  React.useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Controls stay while paused; while playing they fade 3 seconds after the last movement
  const wake = React.useCallback(() => {
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 3000);
  }, []);
  React.useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);
  const showChrome = !state.playing || chrome;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    if (handlePlayerKey(event.nativeEvent, player, containerRef.current)) {
      event.preventDefault();
      wake();
    }
  };

  return (
    <div className={className}>
      <div
        ref={containerRef}
        role="region"
        aria-label={copy.videoPlayer(item.title)}
        tabIndex={live ? 0 : -1}
        onKeyDown={onKeyDown}
        onPointerMove={live ? wake : undefined}
        onClick={live ? () => player.toggle() : undefined}
        className={cn(
          "relative w-full overflow-hidden bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-white",
          fullscreen ? "h-full" : "aspect-video rounded-[13px]"
        )}
      >
        <div ref={slot} className="absolute inset-0" />

        {!live && (
          <div className="absolute inset-0">
            {poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" className="h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/25">
              <button
                type="button"
                aria-label={copy.playTitle(item.title)}
                onClick={event => {
                  event.stopPropagation();
                  start(null);
                }}
                className="inline-flex h-[89px] w-[89px] items-center justify-center rounded-full bg-white text-[#16152B] shadow-xl outline-none focus-visible:ring-4 focus-visible:ring-white/70"
              >
                <Play className="ml-1 h-9 w-9" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {isCurrent && state.loading && !state.error && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            role="status"
          >
            <Loader2 className="h-10 w-10 animate-spin motion-reduce:animate-none" aria-hidden />
            <span className="sr-only">{copy.loading}</span>
          </div>
        )}

        {isCurrent && state.error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-[21px] text-center"
            role="alert"
          >
            <p className="text-[17px] font-semibold">{copy.errorTitle}</p>
            <p className="text-[14px] text-white/80">{copy.errorBody}</p>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                player.retry();
              }}
              className="min-h-[44px] rounded-full bg-white px-[21px] font-semibold text-[#16152B] outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {copy.retry}
            </button>
          </div>
        )}

        {live && !state.error && (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-[8px] pb-[4px] pt-[34px] transition-opacity motion-reduce:transition-none",
              showChrome ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            onClick={event => event.stopPropagation()}
          >
            <SeekBar player={player} durationMs={durationMs} chapters={chapters} />
            <div className="flex items-center gap-[2px]">
              <IconButton label={state.playing ? copy.pause : copy.play} onClick={player.toggle}>
                {state.playing ? (
                  <Pause className="h-6 w-6" aria-hidden />
                ) : (
                  <Play className="h-6 w-6" aria-hidden />
                )}
              </IconButton>
              <span className="px-1 text-[13px] tabular-nums">
                {formatClock(state.currentMs)} / {formatClock(durationMs)}
              </span>
              <span className="flex-1" />
              <IconButton
                label={state.muted ? copy.unmute : copy.mute}
                pressed={state.muted}
                onClick={player.toggleMute}
              >
                {state.muted || state.volume === 0 ? (
                  <VolumeX className="h-5 w-5" aria-hidden />
                ) : (
                  <Volume2 className="h-5 w-5" aria-hidden />
                )}
              </IconButton>
              {player.captions.length > 0 && (
                <IconButton
                  label={
                    state.captionIndex >= 0
                      ? copy.captionsOn(player.captions[state.captionIndex]?.label ?? "")
                      : copy.captionsOff
                  }
                  pressed={state.captionIndex >= 0}
                  onClick={player.cycleCaptions}
                >
                  <Captions className="h-5 w-5" aria-hidden />
                </IconButton>
              )}
              <button
                type="button"
                aria-label={copy.speed(speedLabel(state.rate))}
                onClick={event => {
                  event.stopPropagation();
                  player.cycleRate();
                }}
                className={cn(
                  ICON_BTN,
                  "w-auto min-w-11 px-2 text-[13px] font-semibold tabular-nums"
                )}
              >
                {speedLabel(state.rate)}
              </button>
              {player.pipSupported && (
                <IconButton
                  label={state.pip ? copy.pipExit : copy.pip}
                  pressed={state.pip}
                  onClick={player.togglePip}
                >
                  <PictureInPicture2 className="h-5 w-5" aria-hidden />
                </IconButton>
              )}
              {player.airplayAvailable && (
                <IconButton label={copy.airplay} onClick={player.showAirplay}>
                  <Airplay className="h-5 w-5" aria-hidden />
                </IconButton>
              )}
              <IconButton
                label={fullscreen ? copy.fullscreenExit : copy.fullscreen}
                onClick={() => player.toggleFullscreen(containerRef.current)}
              >
                {fullscreen ? (
                  <Minimize className="h-5 w-5" aria-hidden />
                ) : (
                  <Maximize className="h-5 w-5" aria-hidden />
                )}
              </IconButton>
            </div>
          </div>
        )}
      </div>

      {!live && resumeAt !== null && (
        <ResumeRow
          resumeAt={resumeAt}
          onResume={() => start(resumeAt)}
          onStartOver={() => start(0)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- audio

function useWaveform(url: string | null | undefined) {
  const [peaks, setPeaks] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then(response => (response.ok ? response.json() : null))
      .then(body => {
        if (live) setPeaks(parsePeaks(body, 89));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return peaks;
}

function AudioPlayer(props: MediaPlayerProps) {
  const { item, poster, showResume = true, className } = props;
  const player = usePlayer();
  const isCurrent = player.item?.id === item.id;
  const state = player.state;
  const live = isCurrent && state.started;
  const durationMs = (isCurrent ? state.durationMs : null) ?? item.durationMs ?? null;
  const chapters = normalizeChapters(item.chapters, durationMs);
  const resumeAt = useResumePoint(player, item, showResume);
  const start = useStart(props, player);
  const source = isCurrent ? player.source : null;
  const peaks = useWaveform(source?.kind === "audio" ? source.waveform : null);
  const played = live && durationMs ? state.currentMs / durationMs : 0;
  const artwork = poster ?? item.artwork ?? null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    if (handlePlayerKey(event.nativeEvent, player, null)) event.preventDefault();
  };

  return (
    <div className={className}>
      <div
        role="region"
        aria-label={copy.audioPlayer(item.title)}
        tabIndex={live ? 0 : -1}
        onKeyDown={onKeyDown}
        className="rounded-[21px] bg-[#16152B] p-[21px] text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <div className="flex items-center gap-[13px]">
          <div className="relative h-[89px] w-[89px] shrink-0 overflow-hidden rounded-[13px] bg-white/10">
            {artwork && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artwork} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[17px] font-semibold leading-[22px]">{item.title}</p>
            {item.subtitle && <p className="truncate text-[14px] text-white/75">{item.subtitle}</p>}
          </div>
        </div>

        <div className="relative mt-[13px]">
          {peaks.length > 0 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center gap-[2px]"
            >
              {peaks.map((peak, index) => (
                <span
                  key={index}
                  className={cn(
                    "flex-1 rounded-full",
                    index / peaks.length <= played ? "bg-white" : "bg-white/30"
                  )}
                  style={{ height: `${Math.max(8, peak * 100)}%` }}
                />
              ))}
            </div>
          ) : null}
          {live ? (
            <SeekBar
              player={player}
              durationMs={durationMs}
              chapters={chapters}
              hideTrack={peaks.length > 0}
            />
          ) : (
            <div className="h-11" aria-hidden />
          )}
        </div>

        <div className="mt-1 flex items-center justify-between text-[13px] tabular-nums text-white/80">
          <span>{formatClock(live ? state.currentMs : 0)}</span>
          <span>{formatClock(durationMs)}</span>
        </div>

        <div className="mt-[8px] flex items-center justify-center gap-[13px]">
          <IconButton
            label={copy.back(PLAYER_SKIP_MS / 1000)}
            onClick={() => player.skip(-PLAYER_SKIP_MS)}
            className={cn(!live && "invisible")}
          >
            <RotateCcw className="h-6 w-6" aria-hidden />
          </IconButton>
          <button
            type="button"
            aria-label={
              live ? (state.playing ? copy.pause : copy.play) : copy.playTitle(item.title)
            }
            onClick={() => (live ? player.toggle() : start(null))}
            className="inline-flex h-[55px] w-[55px] items-center justify-center rounded-full bg-white text-[#16152B] outline-none focus-visible:ring-4 focus-visible:ring-white/60"
          >
            {isCurrent && state.loading ? (
              <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : live && state.playing ? (
              <Pause className="h-6 w-6" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-6 w-6" aria-hidden />
            )}
          </button>
          <IconButton
            label={copy.forward(PLAYER_SKIP_MS / 1000)}
            onClick={() => player.skip(PLAYER_SKIP_MS)}
            className={cn(!live && "invisible")}
          >
            <RotateCw className="h-6 w-6" aria-hidden />
          </IconButton>
        </div>

        {live && (
          <div className="mt-[8px] flex items-center justify-center gap-[2px]">
            {player.captions.length > 0 && (
              <IconButton
                label={
                  state.captionIndex >= 0
                    ? copy.captionsOn(player.captions[state.captionIndex]?.label ?? "")
                    : copy.captionsOff
                }
                pressed={state.captionIndex >= 0}
                onClick={player.cycleCaptions}
              >
                <Captions className="h-5 w-5" aria-hidden />
              </IconButton>
            )}
            <button
              type="button"
              aria-label={copy.speed(speedLabel(state.rate))}
              onClick={player.cycleRate}
              className={cn(
                ICON_BTN,
                "w-auto min-w-11 px-2 text-[13px] font-semibold tabular-nums"
              )}
            >
              {speedLabel(state.rate)}
            </button>
            <IconButton
              label={state.muted ? copy.unmute : copy.mute}
              pressed={state.muted}
              onClick={player.toggleMute}
            >
              {state.muted ? (
                <VolumeX className="h-5 w-5" aria-hidden />
              ) : (
                <Volume2 className="h-5 w-5" aria-hidden />
              )}
            </IconButton>
          </div>
        )}

        {live && state.captionIndex >= 0 && (
          <p
            aria-live="polite"
            className="mt-[13px] min-h-[44px] rounded-[13px] bg-black/40 px-[13px] py-[8px] text-center text-[16px] leading-[22px]"
          >
            {state.cueText}
          </p>
        )}

        {isCurrent && state.error && (
          <div
            className="mt-[13px] flex items-center justify-between gap-3 rounded-[13px] bg-black/40 p-[13px]"
            role="alert"
          >
            <span className="text-[14px]">{copy.errorTitle}</span>
            <button
              type="button"
              onClick={player.retry}
              className="min-h-[44px] rounded-full bg-white px-[21px] font-semibold text-[#16152B]"
            >
              {copy.retry}
            </button>
          </div>
        )}
      </div>

      {!live && resumeAt !== null && (
        <ResumeRow
          resumeAt={resumeAt}
          onResume={() => start(resumeAt)}
          onStartOver={() => start(0)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- chapters

/**
 * Chapter list (cs7). Tapping a chapter plays from its start: it seeks when the
 * item is already loaded, otherwise it starts the item there.
 */
export function ChapterList({
  item,
  resolve,
  className,
  headingClassName,
}: {
  item: PlayerItem;
  resolve: SourceResolver;
  className?: string;
  headingClassName?: string;
}) {
  const player = usePlayer();
  const headingId = React.useId();
  const isCurrent = player.item?.id === item.id;
  const chapters = normalizeChapters(item.chapters, item.durationMs);
  if (!chapters.length) return null;
  const currentIndex =
    isCurrent && player.state.started ? chapterIndexAt(chapters, player.state.currentMs) : -1;
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2
        id={headingId}
        className={cn("text-[13px] font-semibold uppercase tracking-[0.08em]", headingClassName)}
      >
        {copy.chapters}
      </h2>
      <ol className="mt-[8px] overflow-hidden rounded-[13px] border border-current/20">
        {chapters.map((chapter, index) => {
          const now = index === currentIndex;
          return (
            <li key={chapter.startMs} className="border-t border-current/15 first:border-t-0">
              <button
                type="button"
                aria-label={copy.chapterAt(spokenClock(chapter.startMs), chapter.title)}
                aria-current={now ? "true" : undefined}
                onClick={() =>
                  isCurrent
                    ? (player.seek(chapter.startMs), player.play())
                    : void player.load(item, resolve, {
                        autoplay: true,
                        startAtMs: chapter.startMs,
                      })
                }
                className="flex min-h-[55px] w-full items-center gap-[13px] px-[21px] text-left outline-none focus-visible:bg-current/10"
              >
                <span className="w-[55px] shrink-0 text-[14px] tabular-nums opacity-80">
                  {formatClock(chapter.startMs)}
                </span>
                <span className={cn("min-w-0 flex-1 text-[16px]", now && "font-semibold")}>
                  {chapter.title}
                </span>
                {now && <Play className="h-5 w-5 shrink-0" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
