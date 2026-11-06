import { beforeEach, describe, expect, it } from "vitest";
import {
  LAYER_TARGETS,
  LOOKS_COPY,
  LIMIT_REASON,
  forgetShared,
  isHeavy,
  limitLine,
  lookCostLine,
  openRowNext,
  readShared,
  rememberShared,
  savedLine,
} from "./looksLook";

// TE-4c, the Themes tab (boards 04, 11).
const now = new Date("2026-11-03T12:00:00Z");

describe("looks helpers", () => {
  beforeEach(() => localStorage.clear());

  it("reads the saved time", () => {
    expect(savedLine(null, now)).toBe("Not saved yet");
    expect(savedLine(new Date("2026-11-03T11:59:40Z"), now)).toBe("Saved just now");
    expect(savedLine(new Date("2026-11-03T11:55:00Z"), now)).toBe("Saved 5 min ago");
    expect(savedLine("2026-11-03T09:00:00Z", now)).toBe("Saved 3 h ago");
    expect(savedLine("2026-11-01T09:00:00Z", now)).toBe("Saved Nov 1");
  });

  it("reads the limit", () => {
    expect(limitLine(4)).toBe("4 of 10");
    expect(limitLine(12)).toBe("10 of 10");
  });

  it("opens the chip's row on its tab", () => {
    expect(openRowNext("container")).toBe("style");
    expect(localStorage.getItem("amped:design-style-open")).toBe("container");
    expect(openRowNext("scene")).toBe("motion");
    expect(localStorage.getItem("amped:design-motion-open")).toBe("particles");
    expect(openRowNext("cursor")).toBeNull();
    expect(Object.keys(LAYER_TARGETS)).toContain("buttonPress");
  });

  it("reads the cost and the Light only filter", () => {
    expect(lookCostLine({} as never)).toBe("Still. Nothing on your page moves.");
    expect(lookCostLine({ particlesEffect: 3 } as never)).toBe("Light, 1 effect.");
    expect(isHeavy({} as never)).toBe(false);
  });

  it("keeps Shared with me per browser, newest first, once per link", () => {
    const entry = (slug: string) => ({
      slug,
      name: slug,
      author: null,
      openedAt: now.toISOString(),
    });
    rememberShared(entry("aaaaaaaa"));
    rememberShared(entry("bbbbbbbb"));
    rememberShared(entry("aaaaaaaa"));
    expect(readShared().map(e => e.slug)).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    forgetShared("aaaaaaaa");
    expect(readShared().map(e => e.slug)).toEqual(["bbbbbbbb"]);
    localStorage.setItem("amped.sharedLooks", '[{"slug":"bad"},{"nope":1}]');
    expect(readShared()).toEqual([]);
  });

  it("keeps the copy free of dashes", () => {
    for (const line of [...Object.values(LOOKS_COPY), LIMIT_REASON]) {
      expect(line).not.toMatch(/[\u2013\u2014]| - /);
    }
  });
});
