import { describe, expect, it } from "vitest";
import {
  SHADER_SCENES,
  findEffect,
  listEffects,
  pageCost,
  shaderPalette,
  themeConfigSchema,
  upgradeTheme,
  type ThemeColors,
} from "../src/index";

// Theme Engine v2 phase 3b (spec 3.5, board 01): the shader scenes.

const COLORS: ThemeColors = {
  button: "#5650a2",
  buttonText: "#ffffff",
  container: "#ffffff",
  text: "#16152b",
};

const GALLERY = [
  "aurora",
  "silk",
  "iridescence",
  "liquid-chrome",
  "plasma",
  "galaxy",
  "threads",
  "lightning",
  "orb",
  "dark-veil",
  "grainient",
  "light-rays",
  "dot-field",
  "ripple-grid",
];
const REACTIVE = ["ferrofluid", "molten-metal", "topography", "faulty-terminal", "letter-glitch"];

describe("shader scene entries", () => {
  it("registers the 14 gallery shaders, the 5 pointer reactive ones and Galaxy field", () => {
    const ids = SHADER_SCENES.map(entry => entry.id);
    expect(ids).toEqual([...GALLERY, ...REACTIVE, "galaxy-field"].map(key => `scene.${key}`));
    for (const id of ids) expect(findEffect(id)?.layer).toBe("scene");
  });

  it("makes every one a Showcase, Heavy WebGL scene of Amped's own with a video tile", () => {
    for (const entry of SHADER_SCENES) {
      expect(entry).toMatchObject({
        tier: "showcase",
        engine: "webgl",
        cost: "heavy",
        source: "amped",
        loop: true,
        addedIn: 2,
        preview: { sample: "scene", video: true },
      });
      expect(entry.render.kind).toBe("webgl");
    }
  });

  it("gives the pointer reactive scenes a reactivity param and the fine pointer mark", () => {
    for (const key of REACTIVE) {
      const entry = findEffect(`scene.${key}`)!;
      expect(entry.pointer).toBe("fine");
      expect(entry.params["reactivity"]).toMatchObject({ min: 0, max: 100 });
    }
    expect(findEffect("scene.aurora")!.pointer).toBeUndefined();
    expect(findEffect("scene.galaxy-field")!.params["points"]).toMatchObject({
      min: 50,
      max: 200,
      unit: "k",
    });
  });

  it("lists them under the WebGL engine, all heavy, so Light only hides them", () => {
    const webgl = listEffects("scene", { engine: "webgl" });
    expect(webgl).toHaveLength(20);
    expect(webgl.every(entry => entry.cost === "heavy")).toBe(true);
  });
});

describe("uniforms and posters", () => {
  const aurora = findEffect("scene.aurora")!;
  const render = aurora.render as Extract<typeof aurora.render, { kind: "webgl" }>;

  it("passes the palette as vec3 and intensity as 0 to 1", () => {
    const u = render.uniforms({ intensity: 50, palette: "original" }, COLORS);
    expect(u["uI"]).toBe(0.5);
    expect((u["uA"] as number[]).every(v => v >= 0 && v <= 1)).toBe(true);
    expect(u["uReact"]).toBe(0);
  });

  it("reads the creator's colors or a custom color", () => {
    expect(shaderPalette(["#000000", "#000000", "#000000"], { palette: "theme" }, COLORS)).toEqual([
      "#5650a2",
      "#16152b",
      "#ffffff",
    ]);
    const custom = shaderPalette(
      ["#000000", "#000000", "#000000"],
      { palette: "custom", color: "#ff0000" },
      COLORS
    );
    expect(custom[0]).toBe("#ff0000");
    expect(custom[1]).not.toBe("#ff0000");
    expect(shaderPalette(["#111111", "#222222", "#333333"], {}, COLORS)).toEqual([
      "#111111",
      "#222222",
      "#333333",
    ]);
  });

  it("paints a poster gradient in the same palette", () => {
    expect(render.poster(COLORS)).toMatch(/gradient\(/);
    expect(render.poster(COLORS, { palette: "custom", color: "#ff0000" })).not.toBe(
      render.poster(COLORS)
    );
  });

  it("maps Galaxy field stars 50k to 200k onto 0 to 1", () => {
    const field = findEffect("scene.galaxy-field")!.render as typeof render;
    expect(field.uniforms({ points: 50 }, COLORS)["uDensity"]).toBe(0);
    expect(field.uniforms({ points: 200 }, COLORS)["uDensity"]).toBe(1);
  });
});

describe("storage", () => {
  it("upgrades a shader scene stored by id to the scene base with clamped params", () => {
    const v2 = upgradeTheme({
      background: { type: "color", value: "#101010" },
      particlesEffect: 0,
      particlesEffectId: "scene.aurora",
      particlesParams: { intensity: 400, palette: "theme" },
    });
    expect(v2.scene.base).toEqual({
      type: "shader",
      id: "scene.aurora",
      params: expect.objectContaining({ intensity: 100, palette: "theme" }),
    });
    expect(v2.scene.overlay).toBeUndefined();
    expect(pageCost(v2).parts).toEqual([{ layer: "scene", label: "Aurora", cost: "heavy" }]);
  });

  it("keeps the background base for particle scenes and the v1 look", () => {
    const v2 = upgradeTheme({
      background: { type: "color", value: "#101010" },
      particlesEffect: 3,
    });
    expect(v2.scene.base).toEqual({ type: "color", value: "#101010" });
    expect(v2.scene.overlay?.id).toBe("scene.snow");
  });

  it("accepts shader ids in particlesEffectId", () => {
    expect(themeConfigSchema.safeParse({ particlesEffectId: "scene.ferrofluid" }).success).toBe(
      true
    );
  });
});
