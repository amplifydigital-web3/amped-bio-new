import { renderToStaticMarkup } from "react-dom/server";
import {
  PARTICLE_PRESETS,
  getEffect,
  toV4Options,
  upgradeTheme,
  type ThemeConfig,
} from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { ParticlesLayer } from "../src/creator/particles-layer";
import { particleLayerOptions } from "../src/creator/particles-options";
import { lookFor } from "../src/creator/look";

// Theme Engine v2 phase 1c: the shared particle overlay on tsParticles v4.

type Loose = Record<string, any>;
const COLORS = { button: "#f3f4f6", buttonText: "#000000", container: "#ffffff", text: "#000000" };
const PROFILE = { name: "Maya Rivera" };

describe("particleLayerOptions (029 I03, 041 I01 to I04)", () => {
  const base = toV4Options(PARTICLE_PRESETS[2]!) as Loose;

  it("keeps the overlay's own options and adds the page rules", () => {
    const options = particleLayerOptions(base, { still: false, finePointer: true }) as Loose;
    expect(options.particles.number).toEqual(base.particles.number);
    expect(options.particles.paint).toEqual(base.particles.paint);
    expect(options.particles.links).toEqual(base.particles.links);
    expect(options.particles.move).toEqual(base.particles.move);
    expect(options.interactivity.events.onHover).toEqual(base.interactivity.events.onHover);
    expect(options.interactivity.events.onClick).toEqual({ enable: false });
    expect(options.interactivity.detectsOn).toBe("window");
    expect(options).toMatchObject({
      fullScreen: { enable: false, zIndex: 0 },
      fpsLimit: 60,
      detectRetina: true,
      pauseOnBlur: true,
      pauseOnOutsideViewport: true,
    });
  });

  it("holds still with no pointer effects under Pause motion or reduced motion", () => {
    const options = particleLayerOptions(base, { still: true, finePointer: true }) as Loose;
    expect(options.particles.move.enable).toBe(false);
    expect(options.particles.move.speed).toBe(base.particles.move.speed);
    expect(options.interactivity.events.onHover).toEqual({ enable: false });
  });

  it("drops hover on touch screens", () => {
    const options = particleLayerOptions(base, { still: false, finePointer: false }) as Loose;
    expect(options.particles.move.enable).toBe(true);
    expect(options.interactivity.events.onHover).toEqual({ enable: false });
  });

  it("does not change the options it is given", () => {
    const before = JSON.stringify(base);
    particleLayerOptions(base, { still: true, finePointer: false });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("ParticlesLayer", () => {
  it("renders a host that never takes taps for a live overlay", () => {
    const html = renderToStaticMarkup(
      <ParticlesLayer entry={getEffect("scene", "scene.snow")} colors={COLORS} />
    );
    expect(html).toBe(
      '<div aria-hidden="true" class="pointer-events-none absolute inset-0"></div>'
    );
  });

  it("renders nothing for none, retired or missing overlays", () => {
    for (const entry of [
      null,
      getEffect("scene", "scene.none"),
      getEffect("scene", "scene.matrix"),
    ]) {
      expect(renderToStaticMarkup(<ParticlesLayer entry={entry} colors={COLORS} />)).toBe("");
    }
  });
});

describe("CreatorPage overlay", () => {
  // A full v1 config, so its v2 upgrade writes back the same values
  const withSnow: ThemeConfig = {
    buttonStyle: 5,
    containerStyle: 9,
    background: { type: "color", value: "#101820" },
    buttonColor: "#007523",
    containerColor: "#118901",
    fontFamily: "Roboto",
    fontSize: "16px",
    fontColor: "#ffffff",
    transparency: 45,
    buttonEffect: 8,
    particlesEffect: 3,
    heroEffect: 2,
  };
  const host = '<div aria-hidden="true" class="pointer-events-none absolute inset-0"></div>';

  it("draws the shared layer inside the scene for v1 and v2 configs", () => {
    const v1 = renderToStaticMarkup(
      <CreatorPage theme={withSnow} mode="public" profile={PROFILE} />
    );
    expect(v1).toContain(host);
    const v2 = renderToStaticMarkup(
      <CreatorPage theme={upgradeTheme(withSnow)} mode="public" profile={PROFILE} />
    );
    expect(v2).toBe(v1);
  });

  it("draws no layer for Matrix or no particles", () => {
    for (const particlesEffect of [0, 6]) {
      const html = renderToStaticMarkup(
        <CreatorPage theme={{ particlesEffect }} mode="public" profile={PROFILE} />
      );
      expect(html).not.toContain("pointer-events-none absolute inset-0");
    }
  });

  it("still honors an overlay override", () => {
    const html = renderToStaticMarkup(
      <CreatorPage
        theme={withSnow}
        mode="public"
        profile={PROFILE}
        renderOverlay={effect => <b>{effect}</b>}
      />
    );
    expect(html).toContain("<b>3</b>");
    expect(html).not.toContain(host);
  });
});

describe("look colors", () => {
  it("hands effects the creator's colors with the v1 defaults", () => {
    expect(lookFor({ fontColor: "#ffffff", buttonColor: "#7c3aed" }).colors).toEqual({
      button: "#7c3aed",
      buttonText: "#ffffff",
      container: "#ffffff",
      text: "#ffffff",
    });
    expect(lookFor({}).colors).toEqual(COLORS);
  });

  it("reads overlay params from a v2 slot", () => {
    const v2 = upgradeTheme({ particlesEffect: 3 });
    const tuned = {
      ...v2,
      scene: { ...v2.scene, overlay: { id: "scene.snow", params: { density: 80 } } },
    };
    expect(lookFor(tuned).overlayParams).toEqual({ density: 80 });
    expect(lookFor({ particlesEffect: 3 }).overlayParams).toEqual({});
  });
});
