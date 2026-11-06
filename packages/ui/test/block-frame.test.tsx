// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockFrame } from "../src/blocks/block-frame";
import { CountdownRow } from "../src/blocks/countdown-row";
import { OPENS_NOW_LINE, countdownRowLine } from "../src/blocks/countdown-line";
import { entranceKeyframes, resolveEntrance } from "../src/blocks/block-motion";

// Block Review v2 B0: the block frame (entrance and attention) and the
// countdown row for a block before go live.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THEME = { buttonColor: "#5650a2", fontColor: "#ffffff" };

let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observed.push(callback);
  }
  observe() {}
  disconnect() {}
}

let animate: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as never;
}

function mount(node: React.ReactNode) {
  act(() => root.render(node));
}

function comeIntoView() {
  act(() => observed.forEach(callback => callback([{ isIntersecting: true }])));
}

const block = (config: Record<string, unknown>) => ({ id: 7, config: { label: "Shop", ...config } });

beforeEach(() => {
  vi.useFakeTimers();
  observed = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
  animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null, oncancel: null }));
  HTMLElement.prototype.animate = animate as never;
  window.sessionStorage.clear();
  setReducedMotion(false);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BlockFrame", () => {
  it("renders its block with nothing hidden before script runs", () => {
    const html = renderToStaticMarkup(
      <BlockFrame block={block({ attention: { preset: "glow" } })} theme={THEME}>
        <a href="https://example.com">Shop</a>
      </BlockFrame>
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("opacity");
  });

  it("plays the entrance once per visit and attention 3 times", () => {
    const onPlay = vi.fn();
    const frame = (
      <BlockFrame
        block={block({ attention: { preset: "pulse" } })}
        theme={THEME}
        entranceKey="maya"
        onAttentionPlay={onPlay}
      >
        <a href="https://example.com">Shop</a>
      </BlockFrame>
    );
    mount(frame);
    comeIntoView();
    // Entrance on the frame, short because the block was in view on load
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]![1]).toMatchObject({ duration: 233 });
    expect(window.sessionStorage.getItem("amped.block-entrance.maya.7")).toBe("1");

    act(() => vi.advanceTimersByTime(377));
    expect(onPlay).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: "pulse", play: 1, animated: true })
    );
    act(() => vi.advanceTimersByTime(8000 * 5));
    expect(onPlay).toHaveBeenCalledTimes(3);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(window.sessionStorage.getItem("amped.block-attention.maya.7")).toBe("3");

    // A second mount in the same visit plays nothing again
    act(() => root.unmount());
    root = createRoot(container);
    animate.mockClear();
    mount(frame);
    comeIntoView();
    act(() => vi.advanceTimersByTime(60_000));
    expect(animate).not.toHaveBeenCalled();
  });

  it("does nothing under reduced motion, but still counts attention plays", () => {
    setReducedMotion(true);
    const onPlay = vi.fn();
    mount(
      <BlockFrame
        block={block({ attention: { preset: "shimmer" } })}
        theme={THEME}
        onAttentionPlay={onPlay}
      >
        <a href="https://example.com">Shop</a>
      </BlockFrame>
    );
    comeIntoView();
    act(() => vi.advanceTimersByTime(60_000));
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelector("[data-attention-overlay]")).toBeNull();
    expect(onPlay).toHaveBeenCalledTimes(3);
    expect(onPlay).toHaveBeenLastCalledWith(expect.objectContaining({ animated: false }));
  });

  it("does nothing while the page's Pause motion is on", () => {
    const onPlay = vi.fn();
    mount(
      <BlockFrame
        block={block({ attention: { preset: "edge" } })}
        theme={THEME}
        paused
        onAttentionPlay={onPlay}
      >
        <a href="https://example.com">Shop</a>
      </BlockFrame>
    );
    comeIntoView();
    act(() => vi.advanceTimersByTime(60_000));
    expect(animate).not.toHaveBeenCalled();
    expect(onPlay).toHaveBeenCalledTimes(3);
  });

  it("plays no entrance when the block turns it off", () => {
    mount(
      <BlockFrame block={block({ motion: { entrance: false, style: "rise" } })} theme={THEME}>
        <p>Text</p>
      </BlockFrame>
    );
    comeIntoView();
    act(() => vi.advanceTimersByTime(60_000));
    expect(animate).not.toHaveBeenCalled();
  });

  it("replays in the editor preview when the creator changes a setting", () => {
    const render = (config: Record<string, unknown>) =>
      mount(
        <BlockFrame block={block(config)} theme={THEME} entranceKey="maya" mode="preview">
          <a href="https://example.com">Shop</a>
        </BlockFrame>
      );
    render({ motion: { entrance: true, style: "rise" } });
    comeIntoView();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);

    render({ motion: { entrance: true, style: "fade" } });
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[1]![0]).toEqual(entranceKeyframes("fade"));

    render({ motion: { entrance: true, style: "fade" }, attention: { preset: "pop" } });
    expect(animate).toHaveBeenCalledTimes(3);
  });
});

describe("entrance styles", () => {
  it("plays Rise for the theme default", () => {
    expect(resolveEntrance("theme")).toBe("rise");
    expect(entranceKeyframes("theme")[0]).toMatchObject({ transform: "translateY(13px)" });
    expect(entranceKeyframes("scale")[0]).toMatchObject({ transform: "scale(0.97)" });
  });
});

describe("CountdownRow", () => {
  const dto = { config: { label: "Kiln sale preview" }, scheduled: { start: "2026-11-06T20:00:00Z" } };

  it("shows the label and the countdown line, with no link or button", () => {
    const html = renderToStaticMarkup(
      <CountdownRow
        block={dto}
        theme={THEME}
        now={new Date("2026-10-26T20:00:00Z")}
        visitorZone="UTC"
      />
    );
    expect(html).toContain("Kiln sale preview");
    expect(html).toContain("Opens in 11 days · Fri 6 Nov, 8:00 PM your time");
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toMatch(/<button[\s>]/);
    expect(html).not.toContain("href");
  });

  it("counts hours and minutes, never seconds", () => {
    expect(countdownRowLine(dto.scheduled.start, new Date("2026-11-06T17:30:00Z"), "UTC")).toMatch(
      /^Opens in 2 hours/
    );
    expect(countdownRowLine(dto.scheduled.start, new Date("2026-11-06T19:59:30Z"), "UTC")).toMatch(
      /^Opens in 1 minute ·/
    );
  });

  it("says Opens now once the start passes", () => {
    expect(countdownRowLine(dto.scheduled.start, new Date("2026-11-06T20:00:00Z"))).toBe(
      OPENS_NOW_LINE
    );
  });

  it("renders the server line in UTC and moves to the visitor's zone after mount", () => {
    vi.setSystemTime(new Date("2026-10-26T20:00:00Z"));
    const server = renderToStaticMarkup(<CountdownRow block={dto} theme={THEME} />);
    expect(server).toContain("8:00 PM your time");
    mount(<CountdownRow block={dto} theme={THEME} visitorZone="America/New_York" />);
    expect(container.textContent).toContain("Fri 6 Nov, 3:00 PM your time");
    expect(container.querySelector("a, button")).toBeNull();
  });
});
