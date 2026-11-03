import { renderToStaticMarkup } from "react-dom/server";
import { getEffect, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { CreatorButton } from "../src/creator/creator-button";
import { ContainerFx, ButtonFx, cycleMs, premiumSurfaceStyle } from "../src/creator/surface-fx";

// Theme Engine v2 phase 3d (TE-3d): premium surfaces on the shared renderer.

const COLORS = { button: "#5650a2", buttonText: "#ffffff", container: "#ffffff", text: "#16152b" };
const PROFILE = { name: "Maya Rivera" };

const page = (config: ThemeConfig, paused = false) =>
  renderToStaticMarkup(
    <CreatorPage theme={config} mode="public" profile={PROFILE} paused={paused} />
  );

describe("premium container surfaces", () => {
  it("Liquid glass blurs by its param and draws the edge light under the content", () => {
    const html = page({
      containerStyle: 1,
      containerStyleId: "container.liquid-glass",
      containerParams: { blur: 8, refraction: 100 },
    });
    expect(html).toContain('data-fx="liquid-glass"');
    expect(html).toContain("backdrop-filter:blur(8px) saturate(160%)");
    expect(html).toContain("isolate");
    expect(html).toContain("z-index:-1");
    expect(html).toContain("Maya Rivera");
    expect(
      premiumSurfaceStyle(getEffect("container", "container.liquid-glass"), { blur: 99 })
    ).toMatchObject({ backdropFilter: "blur(21px) saturate(160%)" });
    expect(premiumSurfaceStyle(getEffect("container", "container.frosted"), {})).toEqual({});
  });

  it("Electric border crackles on a loop and holds still when paused", () => {
    const config: ThemeConfig = {
      containerStyle: 4,
      containerStyleId: "container.electric-border",
      containerParams: { intensity: 100, speed: 100, color: "#ff8000" },
    };
    const moving = page(config);
    expect(moving).toContain('data-fx="electric-border"');
    expect(moving).toContain("<feDisplacementMap");
    expect(moving).toContain('scale="8"');
    expect(moving).toContain('dur="1300ms"');
    expect(moving).toContain("2px solid #ff8000");
    const still = page(config, true);
    expect(still).toContain("<feTurbulence");
    expect(still).not.toContain("<animate");
  });

  it("Star border travels at the Speed param and rests when paused", () => {
    const entry = getEffect("container", "container.star-border");
    const moving = renderToStaticMarkup(
      <ContainerFx entry={entry} params={{ speed: 25 }} colors={COLORS} />
    );
    expect(moving).toContain("amped-star-top 12000ms linear infinite");
    expect(moving).toContain("amped-star-bottom 12000ms linear infinite 6000ms");
    const still = renderToStaticMarkup(<ContainerFx entry={entry} colors={COLORS} paused />);
    expect(still).not.toContain("amped-star");
    expect(still).toContain("left:33%");
  });

  it("Spotlight sizes from its radius, in the button color", () => {
    const html = renderToStaticMarkup(
      <ContainerFx
        entry={getEffect("container", "container.spotlight")}
        params={{ radius: 100 }}
        colors={COLORS}
      />
    );
    expect(html).toContain('data-fx="spotlight"');
    expect(html).toContain("width:200px");
    expect(html).toContain("#5650a238");
    expect(html).toContain("var(--amped-px, 50%)");
  });

  it("core surfaces draw no extra layer", () => {
    for (const id of ["container.none", "container.frosted", "container.modern-card"]) {
      expect(
        renderToStaticMarkup(<ContainerFx entry={getEffect("container", id)} colors={COLORS} />)
      ).toBe("");
    }
    expect(page({ containerStyle: 1 })).not.toContain("data-fx");
  });

  it("cycleMs scales the cycle by Speed and holds at 0", () => {
    expect(cycleMs({}, 6000)).toBe(6000);
    expect(cycleMs({ speed: 100 }, 6000)).toBe(3000);
    expect(cycleMs({ speed: 0 }, 6000)).toBeNull();
  });
});

describe("Specular buttons", () => {
  it("draws the rim light under the label", () => {
    const html = renderToStaticMarkup(
      <CreatorButton theme={{ buttonStyleId: "button.specular" }} label="Shop" href="/shop" />
    );
    expect(html).toContain('data-fx="specular"');
    expect(html).toContain("isolate");
    expect(html).toContain("Shop");
    expect(
      renderToStaticMarkup(<CreatorButton theme={{ buttonStyle: 3 }} label="Shop" href="/shop" />)
    ).not.toContain("data-fx");
    expect(renderToStaticMarkup(<ButtonFx entry={getEffect("button", "button.soft")} />)).toBe("");
  });
});
