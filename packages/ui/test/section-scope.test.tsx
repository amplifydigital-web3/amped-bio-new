/**
 * The creator section's look (Fan Library FL-4, spec 3.2 and acceptance 4):
 * every text and button pair meets 4.5:1 or falls back to Graphite for that
 * pair, and the fallback is named so the client can log it.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LibraryThemeSummary } from "@repo/constants";
import { contrastRatio, parseHex } from "../src/theme-style";
import { CreatorSectionScope, GRAPHITE, creatorSectionColors } from "../src/creator/section-scope";

const ratio = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!);

function summary(over: Partial<LibraryThemeSummary> = {}): LibraryThemeSummary {
  return {
    button: "#e4572e",
    buttonText: "#ffffff",
    text: "#1b1b1f",
    container: "#ffffff",
    containerOpacity: 1,
    nameFont: "Playfair Display",
    bodyFont: "Inter",
    background: { type: "color", value: "#f6efe6" },
    ...over,
  };
}

describe("creatorSectionColors", () => {
  it("keeps a theme whose pairs read", () => {
    const c = creatorSectionColors(summary({ button: "#2d4b8e" }));
    expect(c.fallbacks).toEqual([]);
    expect(c.base).toBe("#f6efe6");
    expect(c.ink).toBe("#1b1b1f");
    expect(c.button).toBe("#2d4b8e");
    expect(c.buttonInk).toBe("#ffffff");
    expect(ratio(c.muted, c.base)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(c.surfaceMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("finds a label that reads on a light button before giving up the color", () => {
    const c = creatorSectionColors(summary({ button: "#ffd84d", buttonText: "#ffffff" }));
    expect(c.button).toBe("#ffd84d");
    expect(ratio(c.buttonInk, c.button)).toBeGreaterThanOrEqual(4.5);
    expect(c.fallbacks).not.toContain("button");
  });

  it("falls back to Graphite for page text that does not read", () => {
    const c = creatorSectionColors(
      summary({ text: "#cccccc", background: { type: "color", value: "#dddddd" } })
    );
    expect(c.fallbacks).toContain("page");
    expect(c.base).toBe(GRAPHITE.bg);
    expect(c.ink).toBe(GRAPHITE.ink);
  });

  it("reads a gradient by its first stop and keeps the gradient as the page", () => {
    const c = creatorSectionColors(
      summary({
        text: "#ffffff",
        background: { type: "gradient", css: "linear-gradient(180deg, #1f1147 0%, #4b1d6b 100%)" },
        container: "#2a1a55",
      })
    );
    expect(c.base).toBe("#1f1147");
    expect(c.background).toContain("linear-gradient");
    expect(c.fallbacks).toEqual([]);
  });

  it("uses the container when the scene is an image, and Graphite with no theme", () => {
    const image = creatorSectionColors(summary({ background: null, container: "#fafafa" }));
    expect(image.base).toBe("#fafafa");
    const none = creatorSectionColors(null);
    expect(none.base).toBe(GRAPHITE.bg);
    expect(none.fallbacks).toEqual([]);
  });

  it("holds 4.5:1 on every pair for awkward themes", () => {
    const themes = [
      summary({ text: "#777777", container: "#888888", button: "#999999", buttonText: "#aaaaaa" }),
      summary({
        text: "#ffffff",
        container: "#ffff00",
        background: { type: "color", value: "#000000" },
      }),
      summary({
        text: "#00ff00",
        container: "#00ee00",
        background: { type: "color", value: "#003300" },
      }),
    ];
    for (const theme of themes) {
      const c = creatorSectionColors(theme);
      expect(ratio(c.ink, c.base)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.surfaceInk, c.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.buttonInk, c.button)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("CreatorSectionScope", () => {
  it("sets the section variables and the body font on its container", () => {
    const colors = creatorSectionColors(summary());
    const html = renderToStaticMarkup(
      <CreatorSectionScope colors={colors}>
        <p>Inside</p>
      </CreatorSectionScope>
    );
    expect(html).toContain("data-creator-section-scope");
    expect(html).toContain("--c-ink:#1b1b1f");
    expect(html).toContain("--c-btn:#e4572e");
    expect(html).toContain("Inter");
  });
});
