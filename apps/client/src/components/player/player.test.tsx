/**
 * Shared media player (Fan Library #26 phase A, PR 6a). The player lives in
 * @repo/ui; it is tested here because the client carries the jsdom setup.
 * Pure helpers, the keyboard map, the copy rules, and the provider's progress
 * writes and URL refresh against a fake media element.
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CONTENT_PROGRESS,
  contentResumePoint,
  findBannedTerms,
  normalizeWebVtt,
} from "@repo/constants";
import {
  MediaPlayer,
  MiniPlayer,
  PLAYER_COPY,
  PlayerProvider,
  chapterIndexAt,
  clampSeek,
  formatClock,
  handlePlayerKey,
  nextCaptionIndex,
  nextSpeed,
  normalizeChapters,
  parsePeaks,
  playbackToSource,
  progressWriteDue,
  refreshDelayMs,
  speedLabel,
  spokenClock,
  usePlayer,
  type PlayerApi,
  type PlayerItem,
  type ProgressAdapter,
} from "@repo/ui";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe("player helpers", () => {
  it("formats clocks for display and for screen readers", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(492_000)).toBe("8:12");
    expect(formatClock(3_723_000)).toBe("1:02:03");
    expect(formatClock(-5)).toBe("0:00");
    expect(spokenClock(492_000)).toBe("8 minutes 12 seconds");
    expect(spokenClock(3_600_000)).toBe("1 hour");
    expect(spokenClock(0)).toBe("0 seconds");
  });

  it("sorts chapters, drops duplicates and starts past the end, and finds the current one", () => {
    const chapters = normalizeChapters(
      [
        { startMs: 245_000, title: "The tide turns" },
        { startMs: 0, title: "Setting up" },
        { startMs: 245_000, title: "Duplicate" },
        { startMs: 900_000, title: "Past the end" },
      ],
      760_000
    );
    expect(chapters.map(c => c.title)).toEqual(["Setting up", "The tide turns"]);
    expect(chapterIndexAt(chapters, 100_000)).toBe(0);
    expect(chapterIndexAt(chapters, 300_000)).toBe(1);
    expect(chapterIndexAt([{ startMs: 5000, title: "x" }], 0)).toBe(-1);
  });

  it("clamps seeks, schedules refreshes and decides progress writes", () => {
    expect(clampSeek(-10, 1000)).toBe(0);
    expect(clampSeek(5000, 1000)).toBe(1000);
    expect(clampSeek(5000, null)).toBe(5000);
    expect(refreshDelayMs(1_000_000 + 600_000, 1_000_000)).toBe(540_000);
    expect(refreshDelayMs(1_000_000 + 10_000, 1_000_000)).toBe(5_000);
    expect(progressWriteDue(0, 9_999, 10_000)).toBe(false);
    expect(progressWriteDue(0, 10_000, 10_000)).toBe(true);
    expect(progressWriteDue(0, 1, 10_000, true)).toBe(true);
  });

  it("cycles captions and speeds", () => {
    expect(nextCaptionIndex(-1, 2)).toBe(0);
    expect(nextCaptionIndex(0, 2)).toBe(1);
    expect(nextCaptionIndex(1, 2)).toBe(-1);
    expect(nextCaptionIndex(-1, 0)).toBe(-1);
    expect(nextSpeed(1, [0.75, 1, 1.25])).toBe(1.25);
    expect(nextSpeed(1.25, [0.75, 1, 1.25])).toBe(0.75);
    expect(speedLabel(1.25)).toBe("1.25x");
    expect(speedLabel(1)).toBe("1x");
  });

  it("reads the processor's waveform file into buckets", () => {
    const peaks = Array.from({ length: 1000 }, (_, i) => (i % 10) / 10);
    const buckets = parsePeaks({ version: 1, peaks }, 100);
    expect(buckets).toHaveLength(100);
    expect(Math.max(...buckets)).toBeCloseTo(0.9);
    expect(parsePeaks(null)).toEqual([]);
  });

  it("offers Resume from 30 seconds until 95 percent", () => {
    const at = (positionMs: number, completed = false) =>
      contentResumePoint({ positionMs, durationMs: 760_000, completed });
    expect(at(10_000)).toBeNull();
    expect(at(492_000)).toBe(492_000);
    expect(at(740_000)).toBeNull();
    expect(at(492_000, true)).toBeNull();
    expect(contentResumePoint(null)).toBeNull();
  });

  it("accepts WebVTT only", () => {
    expect(normalizeWebVtt("﻿WEBVTT\r\n\r\n00:00.000 --> 00:01.000\r\nHi")).toBe(
      "WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n"
    );
    expect(normalizeWebVtt("WEBVTT - Title\n")).toBe("WEBVTT - Title\n");
    expect(normalizeWebVtt("1\n00:00:00,000 --> 00:00:01,000\nHi")).toBeNull();
    expect(normalizeWebVtt("WEBVTTX\n")).toBeNull();
    expect(normalizeWebVtt("WEBVTT\n\u0000")).toBeNull();
  });

  it("maps read URLs to player sources", () => {
    const base = {
      publicId: "abcdefghijklmnop",
      expiresAt: 5,
      cover: null,
      image: null,
      document: null,
      captions: [],
    };
    expect(
      playbackToSource({
        ...base,
        kind: "video",
        video: { hls: "h", dash: "d", poster: "p" },
        audio: null,
      })
    ).toMatchObject({ kind: "video", hls: "h", poster: "p", expiresAt: 5 });
    expect(
      playbackToSource({
        ...base,
        kind: "audio",
        video: null,
        audio: { src: "a", mimeType: "audio/mp4", waveform: null },
      })
    ).toMatchObject({ kind: "audio", src: "a" });
    expect(playbackToSource({ ...base, kind: "image", video: null, audio: null })).toBeNull();
  });
});

describe("player copy", () => {
  it("has no dashes and no banned money words", () => {
    const strings: string[] = [];
    for (const value of Object.values(PLAYER_COPY)) {
      strings.push(
        typeof value === "function" ? (value as (a: never) => string)("8:12" as never) : value
      );
    }
    for (const text of strings) {
      expect(DASHES.test(text), text).toBe(false);
      expect(findBannedTerms(text), text).toEqual([]);
    }
  });
});

describe("keyboard map", () => {
  function fakePlayer(): PlayerApi {
    const fn = () => vi.fn();
    return {
      item: { id: "x", kind: "video", title: "T" },
      captions: [{ lang: "en", label: "English", src: null }],
      state: { volume: 0.5 },
      toggle: fn(),
      skip: fn(),
      setVolume: fn(),
      toggleFullscreen: fn(),
      toggleMute: fn(),
      cycleCaptions: fn(),
    } as unknown as PlayerApi;
  }
  const key = (k: string, target: EventTarget | null = document.body) =>
    ({ key: k, target }) as unknown as KeyboardEvent;

  it("maps space, k, j, l, arrows, f, m and c", () => {
    const player = fakePlayer();
    for (const k of [" ", "k"]) expect(handlePlayerKey(key(k), player, null)).toBe(true);
    expect(player.toggle).toHaveBeenCalledTimes(2);
    handlePlayerKey(key("j"), player, null);
    handlePlayerKey(key("ArrowRight"), player, null);
    expect(player.skip).toHaveBeenNthCalledWith(1, -10_000);
    expect(player.skip).toHaveBeenNthCalledWith(2, 10_000);
    handlePlayerKey(key("ArrowUp"), player, null);
    expect(player.setVolume).toHaveBeenCalledWith(0.6);
    handlePlayerKey(key("f"), player, null);
    handlePlayerKey(key("m"), player, null);
    handlePlayerKey(key("c"), player, null);
    expect(player.toggleFullscreen).toHaveBeenCalled();
    expect(player.toggleMute).toHaveBeenCalled();
    expect(player.cycleCaptions).toHaveBeenCalled();
    expect(handlePlayerKey(key("q"), player, null)).toBe(false);
  });

  it("leaves arrows to the seek slider and space to buttons", () => {
    const player = fakePlayer();
    const range = document.createElement("input");
    range.type = "range";
    expect(handlePlayerKey(key("ArrowLeft", range), player, null)).toBe(false);
    expect(handlePlayerKey(key(" ", document.createElement("button")), player, null)).toBe(false);
  });
});

// ---------------------------------------------------------------- provider

/** jsdom media elements do not play; make play and pause fire their events. */
function stubMedia() {
  const proto = HTMLMediaElement.prototype;
  const original = { play: proto.play, pause: proto.pause, load: proto.load };
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperty(proto, "paused", {
    configurable: true,
    get() {
      return paused.get(this) ?? true;
    },
  });
  proto.play = function play(this: HTMLMediaElement) {
    paused.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  proto.pause = function pause(this: HTMLMediaElement) {
    if (paused.get(this) === false) {
      paused.set(this, true);
      this.dispatchEvent(new Event("pause"));
    }
  };
  proto.load = () => {};
  return () => {
    proto.play = original.play;
    proto.pause = original.pause;
    proto.load = original.load;
    delete (proto as { paused?: boolean }).paused;
  };
}

const audioItem: PlayerItem = {
  id: "abcdefghijklmnop",
  kind: "audio",
  title: "Tide tables, voice memo",
  subtitle: "Maya Lin",
  durationMs: 231_000,
};

let restore: () => void;
beforeEach(() => {
  restore = stubMedia();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

function Probe({ onApi }: { onApi: (api: PlayerApi) => void }) {
  onApi(usePlayer());
  return null;
}

describe("PlayerProvider", () => {
  it("plays, saves position on pause and offers Resume from saved progress", async () => {
    const saves: Array<{ positionMs: number }> = [];
    const progress: ProgressAdapter = {
      load: vi.fn(async () => ({ positionMs: 120_000, durationMs: 231_000, completed: false })),
      save: vi.fn((_id, snapshot) => void saves.push(snapshot)),
    };
    const resolve = vi.fn(async () => ({
      kind: "audio" as const,
      src: "https://media.example/audio/abcdefghijklmnop/full.m4a?t=1",
      expiresAt: Date.now() + 3_600_000,
    }));
    let api!: PlayerApi;
    render(
      <PlayerProvider progress={progress}>
        <Probe onApi={value => (api = value)} />
        <MediaPlayer item={audioItem} resolve={resolve} />
        <MiniPlayer />
      </PlayerProvider>
    );

    // Saved position becomes a Resume button
    const resume = await screen.findByRole("button", { name: PLAYER_COPY.resumeAt("2:00") });
    await act(async () => resume.click());
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(api.item?.id).toBe(audioItem.id);
    expect(api.state.playing).toBe(true);

    await act(async () => api.pause());
    expect(progress.save).toHaveBeenCalled();
    expect(saves.at(-1)).toMatchObject({ completed: false });
  });

  it("asks for fresh URLs a minute before they expire, and stops cleanly when refused", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({ kind: "audio", src: "https://m/1", expiresAt: Date.now() + 120_000 })
      .mockRejectedValueOnce(new Error("gone"));
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    await act(async () => {
      await api.load(audioItem, resolve, { autoplay: true });
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(api.state.error).toBe("expired");
  });

  it("shows the mini player once play started and closes it", async () => {
    const resolve = vi.fn(async () => ({
      kind: "audio" as const,
      src: "https://m/1",
      expiresAt: Date.now() + 3_600_000,
    }));
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
        <MiniPlayer />
      </PlayerProvider>
    );
    expect(screen.queryByRole("region", { name: PLAYER_COPY.miniPlayer })).toBeNull();
    await act(async () => {
      await api.load(audioItem, resolve, { autoplay: true });
    });
    expect(screen.getByRole("region", { name: PLAYER_COPY.miniPlayer })).toBeInTheDocument();
    expect(screen.getByText(audioItem.title)).toBeInTheDocument();
    await act(async () => screen.getByRole("button", { name: PLAYER_COPY.close }).click());
    expect(screen.queryByRole("region", { name: PLAYER_COPY.miniPlayer })).toBeNull();
    expect(api.item).toBeNull();
  });

  it("writes progress every 10 seconds of play, not on every tick", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const save = vi.fn();
    const resolve = vi.fn(async () => ({
      kind: "audio" as const,
      src: "https://m/1",
      expiresAt: Date.now() + 3_600_000,
    }));
    let api!: PlayerApi;
    render(
      <PlayerProvider progress={{ load: async () => null, save }}>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    await act(async () => {
      await api.load(audioItem, resolve, { autoplay: true });
    });
    const audio = document.querySelector("audio")!;
    const tick = async (ms: number) =>
      act(async () => {
        vi.advanceTimersByTime(ms);
        audio.dispatchEvent(new Event("timeupdate"));
      });
    await tick(4_000);
    await tick(4_000);
    expect(save).not.toHaveBeenCalled();
    await tick(3_000);
    expect(save).toHaveBeenCalledTimes(1);
    await tick(1_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![2]).toEqual({ keepalive: false });
  });
});
