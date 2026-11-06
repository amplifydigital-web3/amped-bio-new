/**
 * Player v2 (Fan Library #26, FL-1). The rules that matter for trust: autoplay
 * never plays an item the viewer can not open and never leaves the creator;
 * locked items never enter the queue; the sleep timer wins over autoplay. Plus
 * the mini player's gestures and the queue sheet's moves. The player lives in
 * @repo/ui; it is tested here because the client carries the jsdom setup.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findBannedTerms } from "@repo/constants";
import {
  MiniPlayer,
  PLAYER_COPY,
  PlayerProvider,
  QueueSheet,
  UpNextList,
  appendToQueue,
  classifySwipe,
  doubleTapSide,
  insertNext,
  moveEntry,
  pickNext,
  sleepEndsAt,
  sleepMinutesLeft,
  usePlayer,
  type PlayerApi,
  type PlayerItem,
  type QueueEntry,
} from "@repo/ui";

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

function makeItem(id: string, ownerId: string, extra: Partial<PlayerItem> = {}): PlayerItem {
  return {
    id: id.padEnd(16, "0"),
    kind: "audio",
    title: `Item ${id}`,
    subtitle: ownerId,
    ownerId,
    durationMs: 60_000,
    ...extra,
  };
}

function entry(id: string, ownerId: string, canOpen = true): QueueEntry {
  return {
    item: makeItem(id, ownerId),
    canOpen,
    resolve: async () => ({
      kind: "audio" as const,
      src: `https://m/${id}`,
      expiresAt: Date.now() + 3_600_000,
    }),
  };
}

// ---------------------------------------------------------------- rules

describe("autoplay and queue rules", () => {
  const current = makeItem("a", "maya");
  const upNext = [entry("a", "maya"), entry("b", "maya"), entry("c", "theo"), entry("d", "maya")];

  it("plays the viewer's queue first, skipping locked entries", () => {
    const queue = [entry("x", "theo", false), entry("y", "theo")];
    const pick = pickNext({ current, queue, upNext, autoplay: true });
    expect(pick?.source).toBe("queue");
    expect(pick?.entry.item.title).toBe("Item y");
    expect(pick?.index).toBe(1);
  });

  it("autoplays only the same creator's items after the current one", () => {
    const pick = pickNext({ current, queue: [], upNext, autoplay: true });
    expect(pick?.source).toBe("upNext");
    expect(pick?.entry.item.title).toBe("Item b");
  });

  it("never autoplays a locked item or one already played", () => {
    const list = [entry("a", "maya"), entry("b", "maya", false), entry("d", "maya")];
    expect(pickNext({ current, queue: [], upNext: list, autoplay: true })?.entry.item.title).toBe(
      "Item d"
    );
    expect(
      pickNext({
        current,
        queue: [],
        upNext: list,
        autoplay: true,
        played: [makeItem("d", "maya").id],
      })
    ).toBeNull();
  });

  it("never leaves the creator, and stops when autoplay is off", () => {
    const onlyOthers = [entry("c", "theo"), entry("e", "lena")];
    expect(pickNext({ current, queue: [], upNext: onlyOthers, autoplay: true })).toBeNull();
    expect(pickNext({ current, queue: [], upNext, autoplay: false })).toBeNull();
    // An item with no owner never autoplays into anything
    expect(pickNext({ current: makeItem("z", ""), queue: [], upNext, autoplay: true })).toBeNull();
  });

  it("refuses to queue locked items and the item playing now", () => {
    const locked = entry("l", "maya", false);
    expect(insertNext([], locked)).toEqual([]);
    expect(appendToQueue([], locked)).toEqual([]);
    const now = entry("a", "maya");
    expect(insertNext([], now, now.item.id)).toEqual([]);
    const q = appendToQueue(appendToQueue([], entry("b", "maya")), entry("b", "maya"));
    expect(q).toHaveLength(1);
    expect(insertNext(q, entry("c", "theo")).map(e => e.item.title)).toEqual(["Item c", "Item b"]);
  });

  it("moves entries and clamps drags past the ends", () => {
    expect(moveEntry(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveEntry(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
    expect(moveEntry(["a", "b", "c"], 1, 99)).toEqual(["a", "c", "b"]);
    expect(moveEntry(["a"], 5, 0)).toEqual(["a"]);
  });

  it("times the sleep timer in whole minutes", () => {
    expect(sleepEndsAt(15, 1_000)).toBe(901_000);
    expect(sleepEndsAt("end", 1_000)).toBeNull();
    expect(sleepEndsAt("off")).toBeNull();
    expect(sleepMinutesLeft(901_000, 1_000)).toBe(15);
    expect(sleepMinutesLeft(61_000, 1_000)).toBe(1);
    expect(sleepMinutesLeft(null)).toBeNull();
  });

  it("reads taps, swipes and double tap sides", () => {
    expect(classifySwipe(2, 3, 120)).toBe("tap");
    expect(classifySwipe(2, 3, 900)).toBeNull();
    expect(classifySwipe(0, 80, 200)).toBe("down");
    expect(classifySwipe(0, -80, 200)).toBe("up");
    expect(classifySwipe(-90, 20, 200)).toBe("left");
    expect(classifySwipe(90, -20, 200)).toBe("right");
    expect(classifySwipe(30, 20, 200)).toBeNull();
    expect(doubleTapSide(10, 390)).toBe("back");
    expect(doubleTapSide(380, 390)).toBe("forward");
    expect(doubleTapSide(195, 390)).toBeNull();
    expect(doubleTapSide(10, 0)).toBeNull();
  });
});

describe("player v2 copy", () => {
  it("has no dashes and no banned money words", () => {
    const texts = [
      PLAYER_COPY.autoplayNote("Theo Park"),
      PLAYER_COPY.autoplayNoteGeneric,
      PLAYER_COPY.queueEmpty,
      PLAYER_COPY.miniPlayerHint,
      PLAYER_COPY.sleepLeft(1),
      PLAYER_COPY.sleepLeft(12),
      PLAYER_COPY.sleepAtEnd,
      PLAYER_COPY.photoHint,
      PLAYER_COPY.reorder("Item a"),
      ...PLAYER_COPY.shortcuts.flat(),
    ];
    for (const text of texts) {
      expect(DASHES.test(text), text).toBe(false);
      expect(findBannedTerms(text), text).toEqual([]);
    }
    expect(PLAYER_COPY.sleepLeft(1)).toBe("Sleep timer, pauses in 1 minute");
  });
});

// ---------------------------------------------------------------- provider

/** jsdom media elements do not play; make play, pause and end fire their events. */
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

function Probe({ onApi }: { onApi: (api: PlayerApi) => void }) {
  onApi(usePlayer());
  return null;
}

/** The audio element the provider parks; "ended" moves the player on. */
function endCurrent() {
  const audio = document.querySelector("[data-amped-player-parking] audio") as HTMLAudioElement;
  audio.dispatchEvent(new Event("ended"));
}

let restore: () => void;
beforeEach(() => {
  restore = stubMedia();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

async function startWith(api: () => PlayerApi, first: QueueEntry) {
  await act(async () => {
    await api().load(first.item, first.resolve, { autoplay: true });
  });
}

describe("PlayerProvider queue and autoplay", () => {
  it("autoplays the same creator's next item when one ends", async () => {
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    const list = [entry("a", "maya"), entry("c", "theo"), entry("b", "maya")];
    act(() => api.setUpNext(list));
    await startWith(() => api, list[0]!);
    await act(async () => endCurrent());
    expect(api.item?.title).toBe("Item b");
  });

  it("plays the viewer's queue before autoplay, and stops at the end with autoplay off", async () => {
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    act(() => api.setUpNext([entry("a", "maya"), entry("b", "maya")]));
    await startWith(() => api, entry("a", "maya"));
    act(() => {
      expect(api.addToQueue(entry("q", "theo"))).toBe(true);
      expect(api.addToQueue(entry("l", "theo", false))).toBe(false);
    });
    expect(api.queue.map(e => e.item.title)).toEqual(["Item q"]);
    await act(async () => endCurrent());
    expect(api.item?.title).toBe("Item q");
    expect(api.queue).toHaveLength(0);

    act(() => api.setAutoplay(false));
    await act(async () => endCurrent());
    expect(api.item?.title).toBe("Item q");
    expect(api.state.playing).toBe(false);
  });

  it("pauses at the end of the item when the sleep timer says so, without moving on", async () => {
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    act(() => api.setUpNext([entry("a", "maya"), entry("b", "maya")]));
    await startWith(() => api, entry("a", "maya"));
    act(() => api.setSleepTimer("end"));
    expect(api.sleep.choice).toBe("end");
    await act(async () => endCurrent());
    expect(api.item?.title).toBe("Item a");
    expect(api.sleep.choice).toBe("off");
  });

  it("pauses when a minute sleep timer runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    await startWith(() => api, entry("a", "maya"));
    expect(api.state.playing).toBe(true);
    act(() => api.setSleepTimer(15));
    await act(async () => {
      vi.advanceTimersByTime(15 * 60_000);
    });
    expect(api.state.playing).toBe(false);
    expect(api.sleep.choice).toBe("off");
  });

  it("goes back to the item before, and the one left behind plays next", async () => {
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
      </PlayerProvider>
    );
    await startWith(() => api, entry("a", "maya"));
    await startWith(() => api, entry("b", "maya"));
    expect(api.canPrevious).toBe(true);
    await act(async () => api.previous());
    expect(api.item?.title).toBe("Item a");
    expect(api.queue[0]?.item.title).toBe("Item b");
  });
});

describe("mini player gestures", () => {
  it("swipes left for next and up to open", async () => {
    let api!: PlayerApi;
    const onExpand = vi.fn();
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
        <MiniPlayer onExpand={onExpand} />
      </PlayerProvider>
    );
    act(() => api.setUpNext([entry("a", "maya"), entry("b", "maya")]));
    await startWith(() => api, entry("a", "maya"));
    const bar = screen.getByRole("region", { name: PLAYER_COPY.miniPlayer });
    expect(bar.className).toContain("h-16");
    await act(async () => {
      fireEvent.pointerDown(bar, { clientX: 200, clientY: 30 });
      fireEvent.pointerUp(bar, { clientX: 90, clientY: 34 });
    });
    expect(api.item?.title).toBe("Item b");
    await act(async () => {
      fireEvent.pointerDown(bar, { clientX: 100, clientY: 60 });
      fireEvent.pointerUp(bar, { clientX: 104, clientY: 0 });
    });
    expect(onExpand).toHaveBeenCalledWith(expect.objectContaining({ title: "Item b" }));
    // The one pause target is 52 px
    expect(screen.getByRole("button", { name: PLAYER_COPY.pause }).className).toContain("h-[52px]");
  });
});

describe("queue sheet and up next", () => {
  it("reorders with buttons and removes entries", async () => {
    let api!: PlayerApi;
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
        <QueueSheet open onOpenChange={() => {}} creatorName="Maya Lin" />
      </PlayerProvider>
    );
    await startWith(() => api, entry("a", "maya"));
    act(() => {
      api.addToQueue(entry("b", "maya"));
      api.addToQueue(entry("c", "maya"));
    });
    expect(screen.getByText(PLAYER_COPY.autoplayNote("Maya Lin"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: PLAYER_COPY.moveUp("Item c") }));
    expect(api.queue.map(e => e.item.title)).toEqual(["Item c", "Item b"]);
    fireEvent.keyDown(screen.getByRole("button", { name: PLAYER_COPY.reorder("Item c") }), {
      key: "ArrowDown",
    });
    expect(api.queue.map(e => e.item.title)).toEqual(["Item b", "Item c"]);
    fireEvent.click(screen.getByRole("button", { name: PLAYER_COPY.removeFromQueue("Item b") }));
    expect(api.queue.map(e => e.item.title)).toEqual(["Item c"]);
  });

  it("lists only the creator's items the viewer can open, and plays one on tap", async () => {
    let api!: PlayerApi;
    const current = makeItem("a", "maya");
    render(
      <PlayerProvider>
        <Probe onApi={value => (api = value)} />
        <UpNextList item={current} creatorName="Maya Lin" />
      </PlayerProvider>
    );
    act(() =>
      api.setUpNext([
        entry("a", "maya"),
        entry("b", "maya"),
        entry("c", "theo"),
        entry("l", "maya", false),
      ])
    );
    expect(screen.getByRole("heading", { name: PLAYER_COPY.upNextFrom("Maya Lin") })).toBeVisible();
    expect(screen.queryByRole("button", { name: PLAYER_COPY.playItem("Item c") })).toBeNull();
    expect(screen.queryByRole("button", { name: PLAYER_COPY.playItem("Item l") })).toBeNull();
    expect(screen.queryByRole("button", { name: PLAYER_COPY.playItem("Item a") })).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: PLAYER_COPY.playItem("Item b") }))
    );
    expect(api.item?.title).toBe("Item b");
  });
});
