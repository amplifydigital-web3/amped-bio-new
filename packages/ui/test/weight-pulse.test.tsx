// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { CreatorPage } from "../src/creator/creator-page";
import { WeightPulseName, pulseWeight } from "../src/creator/weight-pulse";

// Theme Engine v2 TE-3e2: Weight pulse

describe("pulseWeight", () => {
  it("is boldest on the name and lightest at the reach", () => {
    expect(pulseWeight(0, 500, 300, 900)).toBe(900);
    expect(pulseWeight(500, 500, 300, 900)).toBe(300);
    expect(pulseWeight(9999, 500, 300, 900)).toBe(300);
    expect(pulseWeight(250, 500, 300, 900)).toBe(750);
  });
});

describe("CreatorPage", () => {
  const theme = {
    heroEffectId: "name.weight-pulse",
    heroEffectParams: { lightest: 300, boldest: 900 },
  };

  it("draws Weight pulse with the catalog fonts and its range link", () => {
    const html = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={{ name: "Maya" }} loadFonts />
    );
    expect(html).toContain('data-effect="name.weight-pulse"');
    expect(html).toContain("wght@300..900");
  });

  it("shows the plain name without them", () => {
    const html = renderToStaticMarkup(
      <CreatorPage theme={theme} mode="public" profile={{ name: "Maya" }} />
    );
    expect(html).not.toContain("name.weight-pulse");
    expect(html).toContain(">Maya<");
  });
});

describe("WeightPulseName", () => {
  it("follows a fine pointer and resets when it unmounts", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine"),
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      // Runs at once; 0 so the next move schedules its own frame
      cb(0);
      return 0;
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(<WeightPulseName text="Maya" params={{ lightest: 300, boldest: 900 }} />)
    );
    const span = host.querySelector<HTMLSpanElement>('[data-effect="name.weight-pulse"]')!;
    span.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 30,
      width: 100,
      height: 30,
      x: 0,
      y: 0,
      toJSON() {},
    });
    const move = (x: number, y: number) =>
      window.dispatchEvent(
        Object.assign(new Event("pointermove"), { clientX: x, clientY: y, pointerType: "mouse" })
      );
    move(50, 10);
    expect(span.style.fontWeight).toBe("900");
    // The name face's own axes (wdth, opsz) stay inherited
    expect(span.style.fontVariationSettings).toBe("");
    move(5000, 5000);
    expect(span.style.fontWeight).toBe("300");
    await act(async () => root.unmount());
    expect(span.style.fontWeight).toBe("");
    vi.unstubAllGlobals();
  });
});
