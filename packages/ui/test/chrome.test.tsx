import { renderToStaticMarkup } from "react-dom/server";
import type { ThemeConfig } from "@repo/constants";
import { CreatorButton } from "../src/creator/creator-button";
import { CreatorPage } from "../src/creator/creator-page";
import { hoverSpeedMs, lookCost, lookFor, nameLoopStyle } from "../src/creator/look";

// Theme Engine v2 phase 2, Editor chrome: params and the weak device on the page.

const PROFILE = { name: "Maya Rivera", bio: "Night sky photographer." };

describe("name params", () => {
  it("scales a loop's cycle with Speed; Medium keeps the cycle as shipped", () => {
    expect(nameLoopStyle(lookFor({ heroEffect: 6 }))).toBeUndefined();
    expect(nameLoopStyle(lookFor({ heroEffect: 6, heroEffectParams: { speed: "slow" } }))).toEqual({
      animationDuration: "1600ms",
    });
    expect(
      nameLoopStyle(lookFor({ heroEffectId: "name.shiny", heroEffectParams: { speed: "fast" } }))
    ).toEqual({ animationIterationCount: 1, animationDuration: "1560ms" });
  });

  it("paints a custom color through the effect's color variables", () => {
    const style = nameLoopStyle(
      lookFor({
        heroEffectId: "name.outline",
        heroEffectParams: { palette: "custom", color: "#ff00aa" },
      })
    );
    expect(style).toEqual({ "--amped-font": "#ff00aa", "--amped-name-glow": "#ff00aaB3" });
  });

  it("plays every loop once on a weak device", () => {
    expect(nameLoopStyle(lookFor({ heroEffect: 8 }), false, true)).toEqual({
      animationIterationCount: 1,
    });
    // Pause motion still wins: the settled look has no animation to count
    expect(nameLoopStyle(lookFor({ heroEffect: 8 }), true, true)).toBeUndefined();
  });
});

describe("hover Speed", () => {
  it("sets the transition only when picked", () => {
    expect(hoverSpeedMs(lookFor({ buttonEffect: 1 }))).toBeUndefined();
    expect(hoverSpeedMs(lookFor({ buttonEffect: 1, buttonEffectParams: { speed: "slow" } }))).toBe(
      377
    );
    const html = renderToStaticMarkup(
      <CreatorButton
        theme={{ buttonEffect: 1, buttonEffectParams: { speed: "fast" } }}
        label="Print shop"
        href="https://example.com"
      />
    );
    expect(html).toContain("transition-duration:144ms");
    const plain = renderToStaticMarkup(
      <CreatorButton theme={{ buttonEffect: 1 }} label="Print shop" href="https://example.com" />
    );
    expect(plain).not.toContain("transition-duration");
  });
});

describe("the weak device on the page", () => {
  it("plays name loops once and leaves strong pages as they are", () => {
    const theme: ThemeConfig = { heroEffect: 8 };
    const weak = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={PROFILE} device="weak" />
    );
    expect(weak).toContain("animation-iteration-count:1");
    const strong = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={PROFILE} device="strong" />
    );
    expect(strong).not.toContain("animation-iteration-count");
  });

  it("reads the page cost from the look", () => {
    expect(lookCost(lookFor({ particlesEffectId: "scene.fire", particlesEffect: 5 })).level).toBe(
      "light"
    );
  });
});
