import {
  SCENE_PRESETS,
  clampParams,
  emojiGlyphs,
  findEffect,
  listEffects,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Scene core (spec 3.5, board 01).

const NEW_SCENES = [
  "scene.fire",
  "scene.triangles",
  "scene.big-circles",
  "scene.ambient",
  "scene.hearts",
  "scene.leaves",
  "scene.petals",
  "scene.emoji-rain",
];
const COLORS = { button: "#e11d74", buttonText: "#ffffff", container: "#ffffff", text: "#1d1d6b" };
type Loose = { particles: Record<string, any>; [key: string]: any };
const optionsOf = (id: string, params = {}) => {
  const entry = findEffect(id)!;
  if (entry.render.kind !== "particles") throw new Error("particles entry expected");
  return entry.render.options(clampParams(entry, params), COLORS) as Loose;
};

describe("phase 2 scenes", () => {
  it("ships eight Plus scenes after the v1 overlays, light, with no v1 integer", () => {
    expect(
      listEffects("scene")
        .slice(9)
        .map(e => e.id)
    ).toEqual(NEW_SCENES);
    for (const id of NEW_SCENES) {
      const entry = findEffect(id)!;
      expect(entry).toMatchObject({
        layer: "scene",
        tier: "plus",
        engine: "particles",
        cost: "light",
        addedIn: 2,
        loop: true,
      });
      expect(entry.legacyId).toBeUndefined();
      // Every fallback is a v1 overlay the editor offers
      expect([1, 2, 3, 4, 5, 7, 8, 9]).toContain(SCENE_PRESETS[id.slice(6)]!.fallback);
    }
  });

  it("builds v4 options: paint, not color; resize at the root", () => {
    for (const id of NEW_SCENES) {
      const options = optionsOf(id);
      expect(options.particles.color).toBeUndefined();
      expect(options.particles.number.value).toBeGreaterThan(0);
      expect(options.background).toBeUndefined();
    }
  });

  it("applies density, speed and the theme palette", () => {
    const base = optionsOf("scene.fire");
    const busy = optionsOf("scene.fire", { density: 80, speed: 80 });
    expect(busy.particles.number.value).toBe(base.particles.number.value * 2);
    expect(busy.particles.move.speed).toBe(base.particles.move.speed * 2);
    const theme = optionsOf("scene.triangles", { palette: "theme" });
    expect(theme.particles.paint.color.value).toBe("#1d1d6b");
    expect(theme.particles.links.color).toBe("#1d1d6b");
  });

  it("keeps emoji glyph colors, so emoji scenes take no palette", () => {
    for (const id of ["scene.hearts", "scene.leaves", "scene.petals", "scene.emoji-rain"]) {
      const entry = findEffect(id)!;
      expect(entry.colorMode).toBe("fixed");
      expect(Object.keys(entry.params)).not.toContain("palette");
      expect(optionsOf(id).particles.shape.type).toBe("emoji");
    }
  });

  it("rains the creator's emoji, at most six, pictographs only", () => {
    expect(emojiGlyphs("\u{1F355}\u{1F354}")).toEqual(["\u{1F355}", "\u{1F354}"]);
    expect(emojiGlyphs("BUY NOW \u{1F680}")).toEqual(["\u{1F680}"]);
    expect(emojiGlyphs("abc")).toHaveLength(3); // falls back to the default set
    expect(emojiGlyphs("\u{1F600}".repeat(9))).toHaveLength(6);
    const options = optionsOf("scene.emoji-rain", { set: "\u{1F355}" });
    expect(options.particles.shape.options.emoji.value).toEqual(["\u{1F355}"]);
  });
});

describe("Scene row storage on the v1 config", () => {
  it("accepts the optional fields and rejects unknown ids and oversized params", () => {
    expect(
      themeConfigSchema.safeParse({
        particlesEffect: 5,
        particlesEffectId: "scene.fire",
        particlesParams: { density: 60, palette: "theme" },
      }).success
    ).toBe(true);
    expect(themeConfigSchema.safeParse({ particlesEffectId: "scene.lava" }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(themeConfigSchema.safeParse({ particlesParams: many }).success).toBe(false);
  });

  it("upgrades a stored scene over the integer, with clamped params", () => {
    const v2 = upgradeTheme({
      particlesEffect: 5,
      particlesEffectId: "scene.fire",
      particlesParams: { density: 999, palette: "loud", extra: 1 },
    });
    expect(v2.scene.overlay).toEqual({
      id: "scene.fire",
      params: { density: 100, speed: 40, palette: "original", color: "#ffffff" },
    });
  });

  it("leaves v1 pages as they are", () => {
    expect(upgradeTheme({ particlesEffect: 3 }).scene.overlay).toEqual({
      id: "scene.snow",
      params: {},
    });
    // A stored id from another layer falls back to the integer
    expect(
      upgradeTheme({ particlesEffect: 3, particlesEffectId: "name.shiny" } as never).scene.overlay
        ?.id
    ).toBe("scene.snow");
  });
});
