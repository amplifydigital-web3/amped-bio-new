import {
  PARTICLE_PARAMS,
  PARTICLE_PRESETS,
  clampParams,
  getEffect,
  particleOptions,
  toV4Options,
} from "../src/index";

// Theme Engine v2 phase 1c: color aware particle factories on tsParticles v4
// (spec 3.5, 3.6). The defaults must keep every saved page as it is.

const COLORS = { button: "#7c3aed", buttonText: "#ffffff", container: "#111827", text: "#f9fafb" };
const OVERLAYS = [1, 2, 3, 4, 5, 7, 8, 9];

type Loose = Record<string, any>;
const opts = (n: number, params = {}, colors = COLORS) =>
  particleOptions(n, params, colors) as Loose;

describe("toV4Options", () => {
  it("moves the fill color to paint and resize to the root, and keeps the rest", () => {
    for (const n of [...OVERLAYS, 6]) {
      const v1 = PARTICLE_PRESETS[n] as Loose;
      const v4 = toV4Options(v1) as Loose;
      expect(v4.particles.color).toBeUndefined();
      expect(v4.particles.paint).toEqual({ color: v1.particles.color });
      expect(v4.interactivity.events.resize).toBeUndefined();
      expect(v4.resize).toEqual(v1.interactivity.events.resize);
      for (const key of ["number", "shape", "opacity", "size", "move", "links", "life"]) {
        expect(v4.particles[key]).toEqual(v1.particles[key]);
      }
      expect(v4.interactivity.events.onHover).toEqual(v1.interactivity.events.onHover);
      expect(v4.interactivity.events.onClick).toEqual(v1.interactivity.events.onClick);
    }
  });

  it("does not touch the shared presets", () => {
    const before = JSON.stringify(PARTICLE_PRESETS);
    for (const n of OVERLAYS) opts(n, { density: 100, speed: 10, palette: "theme" });
    expect(JSON.stringify(PARTICLE_PRESETS)).toBe(before);
  });
});

describe("particleOptions", () => {
  it("returns the v1 preset at the defaults whatever the theme colors", () => {
    for (const n of OVERLAYS) {
      expect(opts(n)).toEqual(toV4Options(PARTICLE_PRESETS[n]!));
      expect(opts(n, clampParams(getEffect("scene", "scene.snow")))).toEqual(
        toV4Options(PARTICLE_PRESETS[n]!)
      );
    }
  });

  it("scales the count with density and the speed with speed", () => {
    const base = PARTICLE_PRESETS[1] as Loose;
    expect(opts(1, { density: 80 }).particles.number.value).toBe(base.particles.number.value * 2);
    expect(opts(1, { density: 10 }).particles.number.value).toBe(20);
    expect(opts(1, { speed: 100 }).particles.move.speed).toBe(2.5);
    expect(opts(8, { speed: 20 }).particles.move.speed).toBe(0.25);
  });

  it("paints with the theme colors", () => {
    const snow = opts(3, { palette: "theme" });
    expect(snow.particles.paint.color.value).toBe(COLORS.text);
    const links = opts(2, { palette: "theme" });
    expect(links.particles.links.color).toBe(COLORS.text);
    // Confetti keeps its color cycle across the theme colors
    const confetti = opts(7, { palette: "theme" });
    expect(confetti.particles.paint.color.value).toEqual([
      COLORS.text,
      COLORS.button,
      COLORS.container,
    ]);
    expect(confetti.particles.paint.color.animation).toEqual(
      (PARTICLE_PRESETS[7] as Loose).particles.color.animation
    );
  });

  it("drops repeated and empty theme colors", () => {
    const colors = { button: "#ffffff", buttonText: "#000000", container: "", text: "#ffffff" };
    expect(opts(7, { palette: "theme" }, colors).particles.paint.color.value).toEqual(["#ffffff"]);
  });

  it("paints with a custom color and ignores a bad one", () => {
    expect(opts(5, { palette: "custom", color: "#ff8800" }).particles.paint.color.value).toBe(
      "#ff8800"
    );
    expect(opts(5, { palette: "custom", color: "orange" })).toEqual(
      toV4Options(PARTICLE_PRESETS[5]!)
    );
  });

  it("keeps the preset colors when theme colors are missing", () => {
    expect(particleOptions(5, { palette: "theme" })).toEqual(toV4Options(PARTICLE_PRESETS[5]!));
  });

  it("renders nothing for an unknown id", () => {
    expect(particleOptions(0)).toEqual({});
    expect(particleOptions(42)).toEqual({});
  });
});

describe("overlay entries", () => {
  it("offer density, speed and colors and follow the theme", () => {
    for (const id of ["scene.floating-dots", "scene.snow", "scene.confetti"]) {
      const entry = getEffect("scene", id);
      expect(entry.params).toBe(PARTICLE_PARAMS);
      expect(entry.colorMode).toBe("theme");
      expect(clampParams(entry)).toEqual({
        density: 40,
        speed: 40,
        palette: "original",
        color: "#ffffff",
      });
    }
  });

  it("keep Matrix retired with its preset and no params", () => {
    const matrix = getEffect("scene", "scene.matrix");
    expect(matrix.retired).toBe(true);
    expect(matrix.params).toEqual({});
    if (matrix.render.kind === "particles") {
      expect(matrix.render.options({}, COLORS)).toEqual(toV4Options(PARTICLE_PRESETS[6]!));
    }
  });
});
