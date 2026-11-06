import { describe, expect, it } from "vitest";
import {
  COMET_TRAILS_EFFECT,
  EMITTER_PARTICLE_LIMIT,
  EMITTER_SCENES,
  EMITTER_SCENE_EFFECTS,
  PARTICLE_PLUGINS,
  PARTICLE_TEXT_EFFECT,
  STILL_COUNT_KEY,
  clampParams,
  cometTrailOptions,
  emitterSceneOptions,
  findEffect,
  pageCost,
  particleTextOptions,
  textDotCount,
  upgradeTheme,
} from "../src";

// Theme Engine v2 phase 3, TE-3f (spec 3.5): the scenes that need plugins.

const colors = { button: "#ff5577", buttonText: "#ffffff", container: "#222244", text: "#fafafa" };
type Loose = Record<string, any>;

describe("emitter scenes", () => {
  it("ships the five official scenes as Plus, Light, new in v2", () => {
    expect(EMITTER_SCENE_EFFECTS.map(e => e.id)).toEqual([
      "scene.fountain",
      "scene.fireworks",
      "scene.hyperspace",
      "scene.sea-anemone",
      "scene.squares",
    ]);
    for (const entry of EMITTER_SCENE_EFFECTS) {
      expect(entry).toMatchObject({ tier: "plus", cost: "light", engine: "particles", addedIn: 2 });
      expect(entry.legacyId).toBeUndefined();
      expect(findEffect(entry.id)).toBe(entry);
    }
  });

  it("caps the live particle count at every density and speed", () => {
    for (const scene of Object.values(EMITTER_SCENES)) {
      for (const params of [{}, { density: 100, speed: 10 }]) {
        const out = emitterSceneOptions(scene, params, colors) as Loose;
        expect(out["particles"].number.limit).toEqual({ mode: "wait", value: EMITTER_PARTICLE_LIMIT });
        expect(out[STILL_COUNT_KEY]).toBeLessThanOrEqual(EMITTER_PARTICLE_LIMIT);
      }
    }
  });

  it("names only plugins the runtime knows, emitters first", () => {
    for (const entry of [...EMITTER_SCENE_EFFECTS, COMET_TRAILS_EFFECT, PARTICLE_TEXT_EFFECT]) {
      if (entry.render.kind !== "particles") throw new Error(entry.id);
      expect(entry.render.plugins.length).toBeGreaterThan(0);
      for (const id of entry.render.plugins) expect(PARTICLE_PLUGINS).toContain(id);
    }
    for (const scene of Object.values(EMITTER_SCENES)) expect(scene.plugins[0]).toBe("emitters");
  });

  it("never draws the emitter box and starts empty", () => {
    for (const scene of Object.values(EMITTER_SCENES)) {
      const preset = scene.preset as Loose;
      expect(preset["emitters"].draw).toBe(false);
      expect(preset["particles"].number.value).toBe(0);
    }
  });

  it("returns the preset at the default params, with the still count", () => {
    const fountain = EMITTER_SCENES["fountain"]!;
    const out = emitterSceneOptions(fountain, {}) as Loose;
    expect(out[STILL_COUNT_KEY]).toBe(fountain.still);
    const { [STILL_COUNT_KEY]: _still, ...rest } = out;
    expect(rest).toEqual(fountain.preset);
  });

  it("scales the burst and the still count with Density", () => {
    const fireworks = EMITTER_SCENES["fireworks"]!;
    const dense = emitterSceneOptions(fireworks, { density: 80 }) as Loose;
    expect(dense["emitters"].rate.quantity).toBe(2);
    expect(dense[STILL_COUNT_KEY]).toBe(fireworks.still * 2);
    const sparse = emitterSceneOptions(fireworks, { density: 10 }) as Loose;
    expect(sparse["emitters"].rate.quantity).toBe(1);
  });

  it("scales every move speed with Speed, the sparks included", () => {
    const out = emitterSceneOptions(EMITTER_SCENES["fireworks"]!, { speed: 80 }) as Loose;
    expect(out["particles"].move.speed).toEqual({ min: 24, max: 36 });
    expect(out["particles"].destroy.split.particles.move.speed).toEqual({ min: 8, max: 20 });
  });

  it("repaints rockets and sparks with the theme or a custom color", () => {
    const themed = emitterSceneOptions(
      EMITTER_SCENES["fireworks"]!,
      { palette: "theme" },
      colors
    ) as Loose;
    expect(themed["particles"].paint.color.value).toEqual(["#fafafa", "#ff5577", "#222244"]);
    expect(themed["particles"].destroy.split.particles.paint.color.value).toEqual([
      "#fafafa",
      "#ff5577",
      "#222244",
    ]);
    const custom = emitterSceneOptions(
      EMITTER_SCENES["hyperspace"]!,
      { palette: "custom", color: "#00ff88" },
      colors
    ) as Loose;
    expect(custom["particles"].paint.color.value).toBe("#00ff88");
  });

  it("never changes the shared preset", () => {
    const before = JSON.stringify(EMITTER_SCENES["squares"]!.preset);
    emitterSceneOptions(
      EMITTER_SCENES["squares"]!,
      { density: 100, speed: 100, palette: "theme" },
      colors
    );
    expect(JSON.stringify(EMITTER_SCENES["squares"]!.preset)).toBe(before);
  });
});

describe("Comet trails", () => {
  it("is Showcase and Heavy, so it counts toward the page budget", () => {
    expect(COMET_TRAILS_EFFECT).toMatchObject({ tier: "showcase", cost: "heavy", loop: true });
    expect(COMET_TRAILS_EFFECT.preview.video).toBe(true);
  });

  it("maps Length 10 to 100 to a tail of 5 to 50 frames", () => {
    const tail = (length: number) =>
      (cometTrailOptions({ length }) as Loose)["particles"].effect.options.trail.length;
    expect(tail(10)).toBe(5);
    expect(tail(40)).toBe(20);
    expect(tail(100)).toBe(50);
  });

  it("clamps Length through the registry params", () => {
    expect(clampParams(COMET_TRAILS_EFFECT, { length: 400 })["length"]).toBe(100);
  });
});

describe("Particle text", () => {
  it("is a Showcase name effect with no Settle", () => {
    expect(PARTICLE_TEXT_EFFECT).toMatchObject({ layer: "name", tier: "showcase", cost: "heavy" });
    expect(PARTICLE_TEXT_EFFECT.loop).toBeUndefined();
  });

  it("maps Dots to the dot count and keeps the mask reading every pixel", () => {
    expect(textDotCount(10)).toBe(150);
    expect(textDotCount(40)).toBe(400);
    expect(textDotCount(100)).toBe(900);
    const out = particleTextOptions({ density: 100 }, colors) as Loose;
    expect(out["particles"].number.value).toBe(900);
    // offset steps through RGBA bytes: anything but 4 skews the letters
    expect(out["canvasMask"].pixels.offset).toBe(4);
    expect(out["canvasMask"].text.fill).toBe(true);
  });

  it("paints the dots in the text color, or a custom one", () => {
    expect((particleTextOptions({}, colors) as Loose)["particles"].paint.color.value).toBe(
      "#fafafa"
    );
    expect(
      (particleTextOptions({ palette: "custom", color: "#123456" }, colors) as Loose)["particles"]
        .paint.color.value
    ).toBe("#123456");
  });

  it("counts as one heavy part of the page budget", () => {
    const base = upgradeTheme({});
    const cost = pageCost({ ...base, name: { ...base.name, id: "name.particle-text" } });
    expect(cost.parts).toContainEqual({ layer: "name", label: "Particle text", cost: "heavy" });
  });
});
