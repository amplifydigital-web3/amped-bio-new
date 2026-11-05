import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMITTER_SCENES, STILL_COUNT_KEY, emitterSceneOptions } from "@repo/constants";
import { particleLayerOptions } from "../src/creator/particles-options";
import { ParticleName, canvasFont } from "../src/creator/particle-name";
import { PARTICLE_TEXT_EFFECT, upgradeTheme } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";

// Theme Engine v2 phase 3, TE-3f: the page rules for plugin scenes and Particle text.

const colors = { button: "#ff5577", buttonText: "#ffffff", container: "#222244", text: "#fafafa" };
type Loose = Record<string, any>;

describe("particleLayerOptions with emitter scenes", () => {
  const base = emitterSceneOptions(EMITTER_SCENES["fireworks"]!, {});

  it("runs the emitters and strips the still count while playing", () => {
    const out = particleLayerOptions(base, { still: false, finePointer: true }) as Loose;
    expect(out["emitters"]).toBeDefined();
    expect(out[STILL_COUNT_KEY]).toBeUndefined();
    expect(out["particles"].number.value).toBe(0);
  });

  it("drops the emitters and scatters the still count when held still", () => {
    const out = particleLayerOptions(base, { still: true, finePointer: true }) as Loose;
    expect(out["emitters"]).toBeUndefined();
    expect(out[STILL_COUNT_KEY]).toBeUndefined();
    expect(out["particles"].number.value).toBe(EMITTER_SCENES["fireworks"]!.still);
    // A held frame keeps its particles: no life, no burst
    expect(out["particles"].life).toBeUndefined();
    expect(out["particles"].destroy).toBeUndefined();
    expect(out["particles"].move.enable).toBe(false);
  });

  it("never edits the scene's own options", () => {
    const before = JSON.stringify(base);
    particleLayerOptions(base, { still: true, finePointer: false });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("ParticleName", () => {
  it("reads the heading font for the mask", () => {
    expect(
      canvasFont({ fontWeight: "800", fontSize: "26px", fontFamily: "Figtree, sans-serif" })
    ).toEqual({ weight: "800", size: "26px", family: "Figtree, sans-serif" });
    expect(canvasFont({ fontWeight: "", fontSize: "", fontFamily: "" })).toEqual({
      weight: "700",
      size: "26px",
      family: "sans-serif",
    });
  });

  it("renders no dots layer when the showcase flag is off, paused or weak", () => {
    for (const props of [
      { showcase: false },
      { showcase: true, paused: true },
      { showcase: true, weak: true },
    ]) {
      const html = renderToStaticMarkup(
        <ParticleName
          entry={PARTICLE_TEXT_EFFECT}
          colors={colors}
          text="Rob"
          onDrawn={() => {}}
          {...props}
        />
      );
      expect(html).toBe("");
    }
  });

  it("keeps the name text in the heading, in its own color until the dots draw", () => {
    const theme = {
      ...upgradeTheme({}),
      name: { ...upgradeTheme({}).name, id: "name.particle-text" },
    };
    const html = renderToStaticMarkup(
      <CreatorPage
        theme={theme}
        mode="public"
        showcase
        profile={{ name: "Rob Frasca" }}
        blocks={null}
      />
    );
    const h1 = html.slice(html.indexOf("<h1"), html.indexOf("</h1>"));
    expect(h1, h1).toContain("Rob Frasca");
    expect(h1).not.toContain("color:transparent");
    // The dots host sits inside the name's own box, over the text
    expect(h1).toMatch(/relative inline-block max-w-full[^>]*>Rob Frasca<span aria-hidden/);
  });
});
