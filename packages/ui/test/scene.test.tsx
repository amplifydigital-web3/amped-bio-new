import { renderToStaticMarkup } from "react-dom/server";
import { GRADIENT_PRESETS, gradientCss, upgradeTheme, type Background } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { gradientScene, textureStyle } from "../src/creator/scene";

// Theme Engine v2 phase 2, Background row: built gradients, drift and textures.

const stops = [
  { color: "#071a2b", at: 0 },
  { color: "#2bb2a0", at: 50 },
  { color: "#7a4fd1", at: 100 },
];
const still = gradientCss({ stops, angle: 160 });
const built: Background = { type: "color", value: still, stops, angle: 160 };
const PROFILE = { name: "Maya Rivera" };

describe("gradientScene", () => {
  it("leaves v1 backgrounds to the v1 rendering", () => {
    expect(gradientScene(undefined, false)).toBeNull();
    expect(gradientScene({ type: "color", value: "#101820" }, false)).toBeNull();
    expect(
      gradientScene({ type: "color", value: "linear-gradient(to right, #00c6ff, #0072ff)" }, false)
    ).toBeNull();
    expect(gradientScene({ type: "image", value: "https://example.com/a.jpg" }, false)).toBeNull();
  });

  it("draws a still built gradient from its stored CSS", () => {
    expect(gradientScene(built, false)).toEqual({ style: { background: still } });
  });

  it("turns a drifting linear gradient around its own angle", () => {
    expect(gradientScene({ ...built, drift: true }, false)).toEqual({
      style: {
        background:
          "linear-gradient(calc(160deg + var(--amped-sweep, 0deg)), #071a2b 0%, #2bb2a0 50%, #7a4fd1 100%)",
      },
      className: "motion-safe:animate-amped-sweep",
    });
  });

  it("moves a drifting mesh, and only with motion allowed", () => {
    const mesh = GRADIENT_PRESETS.find(g => g.mesh)!;
    const background: Background = {
      type: "color",
      value: gradientCss(mesh),
      stops: [...mesh.stops],
      angle: 0,
      mesh: true,
      drift: true,
    };
    expect(gradientScene(background, false)).toEqual({
      style: { background: gradientCss(mesh) },
      className: "motion-safe:animate-amped-mesh-drift motion-safe:bg-[length:200%_200%]",
    });
  });

  it("holds still under Pause motion", () => {
    expect(gradientScene({ ...built, drift: true }, true)).toEqual({
      style: { background: still },
    });
  });
});

describe("textureStyle", () => {
  it("textures built gradients and images only", () => {
    expect(textureStyle({ ...built, texture: "dots" })).toMatchObject({
      backgroundSize: "13px 13px",
    });
    expect(
      textureStyle({ type: "image", value: "https://example.com/a.jpg", texture: "scanlines" })
    ).toHaveProperty("backgroundImage");
    expect(textureStyle({ ...built, texture: "grain" })?.backgroundImage).toMatch(
      /^url\("data:image\/svg\+xml,/
    );
    expect(textureStyle({ type: "color", value: "#101820", texture: "grain" })).toBeNull();
    expect(
      textureStyle({ type: "video", value: "https://example.com/a.mp4", texture: "grain" })
    ).toBeNull();
    expect(textureStyle({ ...built, texture: "none" })).toBeNull();
  });
});

describe("CreatorPage scene base", () => {
  it("drifts a built gradient and lays the texture over it", () => {
    const html = renderToStaticMarkup(
      <CreatorPage
        theme={{ background: { ...built, drift: true, texture: "scanlines" } }}
        mode="public"
        profile={PROFILE}
      />
    );
    expect(html).toContain('class="fixed inset-0 z-0 motion-safe:animate-amped-sweep"');
    expect(html).toContain("var(--amped-sweep, 0deg)");
    expect(html).toContain(
      '<div class="pointer-events-none absolute inset-0" style="background-image:repeating-linear-gradient'
    );
  });

  it("stops the drift under Pause motion", () => {
    const html = renderToStaticMarkup(
      <CreatorPage
        theme={{ background: { ...built, drift: true } }}
        mode="public"
        paused
        profile={PROFILE}
      />
    );
    expect(html).not.toContain("animate-amped-sweep");
    expect(html).toContain(`background:${still}`);
  });

  it("renders a v2 config the same as the v1 config it came from", () => {
    const v1 = { background: { ...built, drift: true, texture: "grain" as const } };
    expect(
      renderToStaticMarkup(<CreatorPage theme={upgradeTheme(v1)} mode="public" profile={PROFILE} />)
    ).toContain("motion-safe:animate-amped-sweep");
  });
});
