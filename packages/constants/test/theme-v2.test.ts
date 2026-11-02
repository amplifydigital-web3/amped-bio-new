import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anyThemeConfigSchema,
  ampedThemeImportSchema,
  normalizeHex,
  parseLegacyGradient,
  readableTextOn,
  themeConfigSchema,
  themeConfigV2Schema,
  upgradeTheme,
  type ThemeConfig,
} from "../src/index";

const THEMES_DIR = join(__dirname, "../../../apps/client/public/themes");
const officialThemes = readdirSync(THEMES_DIR)
  .filter(f => f.endsWith(".ampedtheme"))
  .map(f => ({ file: f, config: JSON.parse(readFileSync(join(THEMES_DIR, f), "utf8")) }));

describe("official theme files", () => {
  it("are all present, including Rings (the cyber collection's missing file)", () => {
    expect(officialThemes.map(t => t.file)).toContain("Rings.ampedtheme");
    expect(officialThemes.length).toBeGreaterThanOrEqual(51);
  });

  it.each(officialThemes)("$file parses as v1 and upgrades to a valid v2 config", ({ config }) => {
    expect(ampedThemeImportSchema.safeParse(config).success).toBe(true);
    const v2 = upgradeTheme(config);
    expect(themeConfigV2Schema.safeParse(v2).success).toBe(true);
    expect(upgradeTheme(v2)).toEqual(v2);
  });
});

describe("upgradeTheme (spec 3.3)", () => {
  it("maps a known theme field by field", () => {
    const neo: ThemeConfig = {
      buttonStyle: 5,
      containerStyle: 9,
      background: { type: "video", value: "https://example.com/Neo.mp4" },
      buttonColor: "#007523",
      containerColor: "#118901",
      fontFamily: "Roboto",
      fontSize: "16px",
      fontColor: "#ffffff",
      transparency: 45,
      buttonEffect: 8,
      particlesEffect: 0,
      heroEffect: 2,
    };
    expect(upgradeTheme(neo)).toEqual({
      version: 2,
      colors: {
        button: "#007523",
        buttonText: "#ffffff",
        container: "#118901",
        containerOpacity: 45,
        text: "#ffffff",
      },
      fonts: {
        name: { family: "Roboto", weight: 700, italic: false, axes: {} },
        body: { family: "Roboto", weight: 400, italic: false, axes: {} },
        size: "m",
      },
      scene: { base: { type: "video", value: "https://example.com/Neo.mp4" } },
      container: { id: "container.modern-card", params: {}, shape: "rounded", border: "none" },
      button: { id: "button.neon", params: {}, shape: "rounded", border: "none", layout: "label" },
      buttonHover: { id: "buttonHover.pop", params: {} },
      buttonPress: { id: "buttonPress.none", params: {} },
      name: { id: "name.glow", params: {}, appliesTo: "name" },
      cursor: { id: "cursor.none", params: {} },
    });
  });

  it("upgrades an empty or missing config to the v1 defaults", () => {
    for (const input of [undefined, null, {}]) {
      const v2 = upgradeTheme(input);
      expect(v2.colors).toEqual({
        button: "#f3f4f6",
        buttonText: "#000000",
        container: "#ffffff",
        containerOpacity: 0,
        text: "#000000",
      });
      expect(v2.fonts.name.family).toBe("Inter");
      expect(v2.scene.base).toEqual({ type: "color", value: "#ffffff" });
      expect(v2.button.id).toBe("button.soft");
      expect(v2.scene.overlay).toBeUndefined();
    }
  });

  it("keeps the pill shape and the arch, and the retired picks", () => {
    expect(upgradeTheme({ buttonStyle: 1 }).button).toMatchObject({
      id: "button.pill",
      shape: "pill",
    });
    expect(upgradeTheme({ containerStyle: 8 }).container).toMatchObject({
      id: "container.arch",
      shape: "arch",
    });
    expect(upgradeTheme({ containerStyle: 6 }).container.id).toBe("container.soft-card");
    expect(upgradeTheme({ particlesEffect: 6 }).scene.overlay?.id).toBe("scene.matrix");
    expect(upgradeTheme({ particlesEffect: 3 }).scene.overlay).toEqual({
      id: "scene.snow",
      params: {},
    });
  });

  it("maps all five v1 font sizes and falls back to m", () => {
    const sizes = ["14px", "16px", "18px", "20px", "24px", "13px", undefined];
    expect(sizes.map(fontSize => upgradeTheme({ fontSize }).fonts.size)).toEqual([
      "s",
      "m",
      "l",
      "xl",
      "xxl",
      "m",
      "m",
    ]);
  });

  it("normalizes colors and clamps opacity", () => {
    const v2 = upgradeTheme({
      buttonColor: "#FFF",
      containerColor: "rgba(10, 20, 30, 0.5)",
      fontColor: "nope",
      transparency: 140,
    });
    expect(v2.colors).toMatchObject({
      button: "#ffffff",
      container: "#0a141e",
      text: "#000000",
      containerOpacity: 100,
    });
    expect(normalizeHex("#11223344")).toBe("#112233");
    expect(normalizeHex("")).toBeNull();
  });

  it("derives a readable button text color", () => {
    expect(readableTextOn("#ffffff")).toBe("#000000");
    expect(readableTextOn("#000000")).toBe("#ffffff");
    expect(readableTextOn("#3252d2")).toBe("#ffffff");
    expect(readableTextOn("#5ce4ff")).toBe("#000000");
  });

  it("keeps background files, presets and posters, and drops bad urls", () => {
    expect(
      upgradeTheme({
        background: {
          type: "image",
          value: "https://cdn.example.com/a.jpg",
          id: "image-aurora-gradient",
          fileId: 12,
        },
      }).scene.base
    ).toEqual({
      type: "image",
      value: "https://cdn.example.com/a.jpg",
      fileId: 12,
      texture: "none",
      presetId: "image-aurora-gradient",
    });
    expect(
      upgradeTheme({
        background: {
          type: "video",
          value: "/relative.mp4",
          thumbnail: "https://cdn.example.com/t.jpg",
          fileId: -3,
        },
      }).scene.base
    ).toEqual({ type: "video", poster: "https://cdn.example.com/t.jpg" });
  });
});

describe("legacy gradients", () => {
  it("parses the four color gradients in the background catalog", () => {
    expect(parseLegacyGradient("linear-gradient(to right, #00c6ff, #0072ff)")).toEqual({
      type: "gradient",
      angle: 90,
      stops: [
        { color: "#00c6ff", at: 0 },
        { color: "#0072ff", at: 100 },
      ],
      mesh: false,
      drift: false,
      texture: "none",
    });
    for (const css of [
      "linear-gradient(to right, #fc466b, #3f5efb)",
      "linear-gradient(to right, #11998e, #38ef7d)",
      "linear-gradient(to right, #f12711, #f5af19)",
    ]) {
      expect(
        themeConfigV2Schema.shape.scene.safeParse({ base: parseLegacyGradient(css) }).success
      ).toBe(true);
    }
  });

  it("reads angles, single colors and strings with no hex color", () => {
    expect(parseLegacyGradient("linear-gradient(45deg, #ff0000 0%, #00ff00 100%)").angle).toBe(45);
    expect(parseLegacyGradient("linear-gradient(-90deg, #ff0000, #00ff00)").angle).toBe(270);
    expect(parseLegacyGradient("linear-gradient(#ff0000, #00ff00)").angle).toBe(180);
    expect(parseLegacyGradient("linear-gradient(to bottom right, #f00, #0f0)").stops).toEqual([
      { color: "#ff0000", at: 0 },
      { color: "#00ff00", at: 100 },
    ]);
    expect(parseLegacyGradient("radial-gradient(circle, #123456, transparent)").stops).toEqual([
      { color: "#123456", at: 0 },
      { color: "#123456", at: 100 },
    ]);
    expect(parseLegacyGradient("linear-gradient(red, blue)")).toMatchObject({
      angle: 90,
      stops: [
        { color: "#3b82f6", at: 0 },
        { color: "#8b5cf6", at: 100 },
      ],
    });
  });

  it("upgrades a color background that holds a gradient string", () => {
    expect(
      upgradeTheme({
        background: { type: "color", value: "linear-gradient(to left, #000000, #ffffff)" },
      }).scene.base
    ).toMatchObject({ type: "gradient", angle: 270 });
  });
});

describe("anyThemeConfigSchema (dispatch on version)", () => {
  const valid = upgradeTheme({ buttonStyle: 3, particlesEffect: 2 });

  it("accepts v1 and v2", () => {
    expect(anyThemeConfigSchema.safeParse({ buttonStyle: 3 }).success).toBe(true);
    expect(anyThemeConfigSchema.safeParse(valid).success).toBe(true);
    expect(anyThemeConfigSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a malformed v2 config instead of importing it as empty v1", () => {
    const broken = { ...valid, colors: { ...valid.colors, button: "blue" } };
    expect(anyThemeConfigSchema.safeParse(broken).success).toBe(false);
    expect(themeConfigSchema.safeParse(broken).success).toBe(true); // why dispatch matters
    expect(() => upgradeTheme(broken as never)).toThrow();
  });

  it("rejects unknown ids, extra keys and engine swaps", () => {
    expect(
      themeConfigV2Schema.safeParse({ ...valid, button: { ...valid.button, id: "button.hack" } })
        .success
    ).toBe(false);
    expect(themeConfigV2Schema.safeParse({ ...valid, css: "body{}" }).success).toBe(false);
    expect(
      themeConfigV2Schema.safeParse({
        ...valid,
        scene: { base: valid.scene.base, overlay: { id: "scene.none" } },
      }).success
    ).toBe(true);
    expect(
      themeConfigV2Schema.safeParse({
        ...valid,
        scene: { base: { type: "shader", id: "scene.snow", params: {} } },
      }).success
    ).toBe(false);
    expect(
      themeConfigV2Schema.safeParse({ ...valid, name: { ...valid.name, id: "button.neon" } })
        .success
    ).toBe(false);
  });
});

describe("sampled v1 configs", () => {
  it("upgrades 2,000 sampled configs to valid, idempotent v2", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 2000; i++) {
      const v1: ThemeConfig = {
        buttonStyle: rand(12) - 1,
        containerStyle: rand(12) - 1,
        buttonEffect: rand(12) - 1,
        heroEffect: rand(12) - 1,
        particlesEffect: rand(12) - 1,
        transparency: rand(120),
        buttonColor: `#${rand(0xffffff).toString(16).padStart(6, "0")}`,
      };
      const v2 = upgradeTheme(v1);
      expect(themeConfigV2Schema.safeParse(v2).success).toBe(true);
      expect(upgradeTheme(v2)).toEqual(v2);
    }
  });
});
