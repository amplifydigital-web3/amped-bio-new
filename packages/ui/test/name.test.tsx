// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { getEffect, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { hasLoopingMotion, lookFor, nameLoopStyle, nameOnBio } from "../src/creator/look";
import {
  NameText,
  entranceShouldPlay,
  graphemes,
  letterStagger,
  scrambleFrame,
} from "../src/creator/name-effect";

// Theme Engine v2 phase 2, Name row (board 08): Settle, Applies to and the entrances.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COLORS = { button: "#111111", buttonText: "#ffffff", container: "#ffffff", text: "#222222" };
const PROFILE = { name: "Maya Rivera", bio: "Night sky photographer." };
const page = (theme: ThemeConfig, paused = false) =>
  renderToStaticMarkup(
    <CreatorPage theme={theme} mode="public" profile={PROFILE} paused={paused} />
  );

function motion(reduce: boolean) {
  window.matchMedia = vi.fn(() => ({ matches: reduce })) as never;
}

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  window.sessionStorage.clear();
  motion(false);
});

describe("name entrance helpers", () => {
  it("keeps emoji and accents whole", () => {
    expect(graphemes("Zoë 👩🏽‍🎤")).toEqual(["Z", "o", "ë", " ", "👩🏽‍🎤"]);
  });

  it("squeezes the stagger so the last letter lands by 610 ms", () => {
    expect(letterStagger(34, 377, 4)).toBe(34);
    expect(letterStagger(34, 377, 20)).toBeCloseTo(233 / 19);
    expect(letterStagger(55, 1, 1)).toBe(0);
  });

  it("scrambles only the unresolved letters and keeps spaces", () => {
    const frame = scrambleFrame(["A", "b", " ", "c"], 1, () => 0);
    expect(frame).toBe("AA A");
  });

  it("plays once per keyed visit, always without a key, never when paused or reduced", () => {
    expect(entranceShouldPlay(false, "maya")).toBe(true);
    expect(entranceShouldPlay(false, "maya")).toBe(false);
    expect(entranceShouldPlay(false)).toBe(true);
    expect(entranceShouldPlay(true)).toBe(false);
    motion(true);
    expect(entranceShouldPlay(false)).toBe(false);
  });
});

describe("NameText", () => {
  it("renders the plain name for a class effect", () => {
    const html = renderToStaticMarkup(
      <NameText entry={getEffect("name", "name.shiny")} text="Maya" colors={COLORS} />
    );
    expect(html).toBe("Maya");
  });

  it("server renders the finished name, with one plain copy for screen readers", () => {
    const html = renderToStaticMarkup(
      <NameText entry={getEffect("name", "name.letter-rise")} text="Maya Rivera" colors={COLORS} />
    );
    expect(html).toContain('<span class="sr-only">Maya Rivera</span>');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/data-letter/g)).toHaveLength(10);
  });

  it("animates each letter with a stagger, then cancels on unmount", () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    HTMLElement.prototype.animate = animate as never;
    const { unmount } = mount(
      <NameText entry={getEffect("name", "name.letter-rise")} text="Maya" colors={COLORS} />
    );
    expect(animate).toHaveBeenCalledTimes(4);
    expect(animate.mock.calls[3]?.[1]).toMatchObject({ duration: 377, delay: 102 });
    unmount();
    expect(cancel).toHaveBeenCalledTimes(4);
  });

  it("plays nothing under Pause motion", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    HTMLElement.prototype.animate = animate as never;
    mount(
      <NameText entry={getEffect("name", "name.focus-in")} text="Maya" colors={COLORS} paused />
    );
    expect(animate).not.toHaveBeenCalled();
  });

  it("scrambles, then settles on the name", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { host } = mount(
      <NameText entry={getEffect("name", "name.decrypt")} text="Maya" colors={COLORS} />
    );
    const visual = host.querySelector("[aria-hidden]")!;
    expect(visual.textContent).toHaveLength(4);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(visual.textContent).toBe("Maya");
    vi.useRealTimers();
  });
});

describe("Settle and Applies to on the page", () => {
  it("plays a new loop once by default and keeps v1 loops looping", () => {
    expect(nameLoopStyle(lookFor({ heroEffectId: "name.shiny" }))).toEqual({
      animationIterationCount: 1,
    });
    expect(nameLoopStyle(lookFor({ heroEffect: 6 }))).toBeUndefined();
    expect(
      nameLoopStyle(lookFor({ heroEffectId: "name.shiny", heroEffectLoop: "always" }))
    ).toBeUndefined();
    expect(page({ heroEffectId: "name.shiny" })).toContain("animation-iteration-count:1");
  });

  it("offers Pause motion only while a loop keeps looping", () => {
    expect(hasLoopingMotion(lookFor({ heroEffectId: "name.shiny" }))).toBe(false);
    expect(
      hasLoopingMotion(lookFor({ heroEffectId: "name.shiny", heroEffectLoop: "always" }))
    ).toBe(true);
    expect(hasLoopingMotion(lookFor({ heroEffect: 8 }))).toBe(true);
  });

  it("puts a class effect on the bio for Name and bio, never an entrance", () => {
    const both = { heroEffectId: "name.outline", heroAppliesTo: "nameAndBio" } as const;
    expect(nameOnBio(lookFor(both))).toBe(true);
    expect(page(both).match(/-webkit-text-stroke/g)).toHaveLength(2);
    expect(page({ heroEffectId: "name.outline" }).match(/-webkit-text-stroke/g)).toHaveLength(1);
    expect(nameOnBio(lookFor({ heroEffectId: "name.decrypt", heroAppliesTo: "nameAndBio" }))).toBe(
      false
    );
  });

  it("renders a v1 name exactly as before", () => {
    const html = page({ heroEffect: 2 });
    expect(html).toContain(">Maya Rivera</h1>");
    expect(html).not.toContain("animation-iteration-count");
  });
});
