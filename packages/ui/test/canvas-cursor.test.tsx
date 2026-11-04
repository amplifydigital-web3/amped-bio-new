import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { findEffect, type ThemeColors } from "@repo/constants";
import { startCanvas, effectColor, rgba } from "../src/motion/canvas";
import { CANVAS_MODULE_KEYS, loadCanvasEffect } from "../src/motion/canvas-effects";
import { CursorLayer } from "../src/creator/cursor-layer";
import { FuzzyName } from "../src/creator/fuzzy-name";
import { ShowcaseProvider } from "../src/creator/showcase-context";

// Theme Engine v2 phase 3c (spec 3.6): the 2D canvas engine and its entries.

const COLORS: ThemeColors = {
  button: "#5650a2",
  buttonText: "#ffffff",
  container: "#ffffff",
  text: "#16152b",
};

function fakeContext() {
  const calls: string[] = [];
  const handler: ProxyHandler<object> = {
    get: (_t, name) =>
      name === "createRadialGradient"
        ? () => ({ addColorStop: () => {} })
        : name === "canvas"
          ? { width: 10, height: 10 }
          : (...args: unknown[]) => {
              calls.push(String(name));
              void args;
            },
    set: () => true,
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}

const HOST = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
} as unknown as HTMLElement;

describe("canvas engine", () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal("window", {
      devicePixelRatio: 2,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  function setup(busy: boolean[]) {
    const { ctx } = fakeContext();
    const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const host = HOST;
    let i = 0;
    const effect = { frame: vi.fn(() => busy[Math.min(i++, busy.length - 1)]!), press: vi.fn() };
    return { canvas, host, effect };
  }

  it("draws while the effect has work and sleeps when it reports none", () => {
    const { canvas, host, effect } = setup([true, false]);
    const handle = startCanvas({ canvas, host, effect, onSlow: () => {} })!;
    expect(handle).not.toBeNull();
    frames.shift()!(16);
    frames.shift()!(32);
    expect(effect.frame).toHaveBeenCalledTimes(2);
    expect(frames).toHaveLength(0);
    handle.stop();
  });

  it("wakes on a press and hands it the point inside the host", () => {
    const { canvas, host, effect } = setup([false]);
    const handle = startCanvas({ canvas, host, effect, onSlow: () => {} })!;
    frames.shift()!(16);
    handle.press(20, 30);
    expect(effect.press).toHaveBeenCalledWith(20, 30);
    expect(frames).toHaveLength(1);
    handle.stop();
  });

  it("returns null without a 2D context", () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    const handle = startCanvas({
      canvas,
      host: HOST,
      effect: { frame: () => false },
      onSlow: () => {},
    });
    expect(handle).toBeNull();
  });

  it("reads a custom color only when the palette is custom", () => {
    expect(effectColor({ palette: "custom", color: "#ff0000" }, "#000000")).toBe("#ff0000");
    expect(effectColor({ palette: "theme", color: "#ff0000" }, "#000000")).toBe("#000000");
    expect(rgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
  });
});

describe("canvas modules", () => {
  it("has a module for every canvas cursor and Click spark, and each draws", async () => {
    const keys = [
      "cursor.glow",
      "cursor.ring",
      "cursor.spark-trail",
      "cursor.pixel-trail",
      "cursor.dot-trail",
      "cursor.splash",
      "buttonPress.click-spark",
    ].map(id => {
      const render = findEffect(id)!.render;
      return render.kind === "canvas" ? render.module : "";
    });
    expect([...CANVAS_MODULE_KEYS].sort()).toEqual([...keys].sort());
    for (const key of CANVAS_MODULE_KEYS) {
      const factory = (await loadCanvasEffect(key))!;
      const effect = factory({}, COLORS);
      const { ctx } = fakeContext();
      const pointer = { x: 50, y: 50, inside: true };
      effect.press?.(10, 10);
      for (let i = 0; i < 3; i++) {
        pointer.x += 12;
        expect(
          typeof effect.frame({ ctx, width: 200, height: 200, time: i / 60, dt: 1 / 60, pointer })
        ).toBe("boolean");
      }
    }
    expect(await loadCanvasEffect("no-such-effect")).toBeNull();
  });

  it("lets a trail fade out, so the loop can sleep", async () => {
    const effect = (await loadCanvasEffect("dot-trail"))!({ length: 8 }, COLORS);
    const { ctx } = fakeContext();
    const pointer = { x: 10, y: 10, inside: true };
    expect(effect.frame({ ctx, width: 100, height: 100, time: 0, dt: 1 / 60, pointer })).toBe(true);
    pointer.inside = false;
    let busy = true;
    for (let i = 0; i < 120 && busy; i++) {
      busy = effect.frame({ ctx, width: 100, height: 100, time: i / 60, dt: 1 / 60, pointer });
    }
    expect(busy).toBe(false);
  });
});

describe("cursor layer and Fuzzy text", () => {
  it("renders no cursor without the showcase flag, for None, or on the server render", () => {
    const glow = findEffect("cursor.glow")!;
    expect(renderToStaticMarkup(<CursorLayer entry={glow} colors={COLORS} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <CursorLayer entry={findEffect("cursor.none")!} colors={COLORS} showcase />
      )
    ).toBe("");
    // useFinePointer starts false, so the first render never draws a cursor
    expect(renderToStaticMarkup(<CursorLayer entry={glow} colors={COLORS} showcase />)).toBe("");
  });

  it("server renders the plain name, readable and selectable, for Fuzzy text", () => {
    const html = renderToStaticMarkup(
      <ShowcaseProvider value={{ showcase: true, paused: false }}>
        <FuzzyName entry={findEffect("name.fuzzy")!} text="Maya Rivera" />
      </ShowcaseProvider>
    );
    expect(html).toContain(">Maya Rivera<");
    expect(html).toContain('data-state="plain"');
    expect(html).not.toContain("text-fill-color");
    expect(html).toContain('aria-hidden="true"');
  });
});
