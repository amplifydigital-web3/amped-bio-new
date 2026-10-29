import {
  ALL_EFFECTS,
  EFFECT_IDS,
  EFFECT_LAYERS,
  EFFECTS_BY_LAYER,
  LAYER_DEFAULTS,
  LEGACY_EFFECT_IDS,
  PARTICLE_PRESETS,
  clampParams,
  findBannedTerms,
  findEffect,
  getEffect,
  legacyEffectId,
  listEffects,
  toV4Options,
  type EffectEntry,
} from "../src/index";
// The two live renderers' maps and presets. Phase 1b replaces them with the
// shared renderer; until then the registry must match them class for class.
import * as editorStyles from "../../../apps/client/src/utils/styles";
import * as publicStyles from "../../../apps/landingpage/src/lib/styles";

const LEGACY_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const LAYER_OF_FIELD = {
  buttonStyle: "button",
  containerStyle: "container",
  buttonEffect: "buttonHover",
  heroEffect: "name",
  particlesEffect: "scene",
} as const;

/** En dash and em dash, built from char codes so this file carries neither. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\s-\\s`);

const classOf = (entry: EffectEntry): string =>
  entry.render.kind === "class" ? entry.render.className : "";

describe("effect registry rules (spec 3.2)", () => {
  it("has unique ids that match the layer pattern", () => {
    const ids = ALL_EFFECTS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ALL_EFFECTS) {
      expect(entry.id).toMatch(
        /^(scene|container|button|buttonHover|buttonPress|name|cursor)\.[a-z0-9-]+$/
      );
      expect(entry.id.split(".")[0]).toBe(entry.layer);
    }
  });

  it("gives every layer a default entry and a full id list", () => {
    for (const layer of EFFECT_LAYERS) {
      expect(findEffect(LAYER_DEFAULTS[layer])?.layer).toBe(layer);
      expect(EFFECT_IDS[layer].length).toBe(EFFECTS_BY_LAYER[layer].length);
    }
  });

  it("covers every v1 integer exactly once, on the right layer", () => {
    for (const [field, layer] of Object.entries(LAYER_OF_FIELD)) {
      const map = LEGACY_EFFECT_IDS[field as keyof typeof LAYER_OF_FIELD];
      expect(
        Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual(LEGACY_IDS);
      for (const [legacy, id] of Object.entries(map)) {
        const entry = findEffect(id);
        expect(entry, `${field} ${legacy}`).toBeDefined();
        expect(entry!.layer).toBe(layer);
        expect(entry!.legacyId).toBe(Number(legacy));
      }
      const withLegacy = EFFECTS_BY_LAYER[layer].filter(e => e.legacyId !== undefined);
      expect(withLegacy.length).toBe(LEGACY_IDS.length);
    }
  });

  it("keeps cost and tier consistent with the engine", () => {
    for (const entry of ALL_EFFECTS) {
      if (entry.cost === "heavy") {
        expect(["webgl", "canvas", "particles"]).toContain(entry.engine);
      }
      if (entry.engine === "css" || entry.engine === "waapi") {
        expect(["still", "light"]).toContain(entry.cost);
      }
      if (entry.tier === "showcase") {
        expect(entry.engine).not.toBe("css");
        expect(entry.pointer === "fine" || ["webgl", "particles"].includes(entry.engine)).toBe(
          true
        );
      }
    }
  });

  it("keeps every param default inside its range", () => {
    for (const entry of ALL_EFFECTS) {
      for (const spec of Object.values(entry.params)) {
        if (spec.kind === "range") {
          expect(spec.default).toBeGreaterThanOrEqual(spec.min);
          expect(spec.default).toBeLessThanOrEqual(spec.max);
        }
        if (spec.kind === "choice") expect(spec.options).toContain(spec.default);
      }
    }
  });

  it("names effects in compliant copy with no dashes (decision 10)", () => {
    for (const entry of ALL_EFFECTS) {
      for (const text of [entry.label, entry.description]) {
        expect(findBannedTerms(text), text).toEqual([]);
        expect(text, text).not.toMatch(DASHES);
        expect(text.toLowerCase(), text).not.toMatch(/tsparticles|react-bits|ogl|webgl|gsap/);
      }
    }
  });
});

describe("registry lookups", () => {
  it("getEffect falls back to the layer default", () => {
    expect(getEffect("button", "button.neon").id).toBe("button.neon");
    expect(getEffect("button", "name.glow").id).toBe("button.soft");
    expect(getEffect("name", "name.unknown").id).toBe("name.none");
    expect(getEffect("cursor", undefined).id).toBe("cursor.none");
  });

  it("listEffects hides retired entries unless asked", () => {
    const names = listEffects("name").map(e => e.id);
    expect(names).not.toContain("name.gradient");
    expect(listEffects("name", { includeRetired: true }).map(e => e.id)).toContain("name.gradient");
    // Pickers offer what the editor offers today
    expect(listEffects("container").map(e => e.legacyId)).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
    expect(
      listEffects("scene")
        .filter(e => e.addedIn === 1)
        .map(e => e.legacyId)
    ).toEqual([0, 1, 2, 3, 4, 5, 7, 8, 9]);
    // The nine v1 overlays plus eight Plus scenes on the slim bundle (phase 2, board 01)
    expect(listEffects("scene").length).toBe(17);
    expect(
      listEffects("name")
        .filter(e => e.addedIn === 1)
        .map(e => e.legacyId)
    ).toEqual([0, 2, 6, 7, 8, 9]);
    // The six v1 name effects plus nine core effects (phase 2, board 08)
    expect(listEffects("name").length).toBe(15);
    // The ten v1 styles plus Hard shadow (phase 2, board 07)
    expect(listEffects("button").length).toBe(11);
    // The ten v1 hovers plus five core hovers (phase 2, board 09)
    expect(listEffects("buttonHover").length).toBe(15);
    expect(listEffects("buttonPress").map(e => e.id)).toEqual([
      "buttonPress.none",
      "buttonPress.ripple",
      "buttonPress.dip",
    ]);
  });

  it("clampParams clamps, snaps, defaults and drops unknown keys", () => {
    const entry: EffectEntry = {
      ...getEffect("scene", "scene.snow"),
      params: {
        density: { kind: "range", min: 10, max: 100, step: 5, default: 40, label: "Density" },
        mood: { kind: "choice", options: ["calm", "busy"], default: "calm", label: "Mood" },
        tint: { kind: "color", default: "theme", label: "Color" },
        word: { kind: "text", maxLength: 4, default: "hi", label: "Word" },
      },
    };
    expect(
      clampParams(entry, { density: 999, mood: "loud", tint: "red", word: "hello", x: 1 })
    ).toEqual({
      density: 100,
      mood: "calm",
      tint: "theme",
      word: "hell",
    });
    expect(clampParams(entry, { density: 23, tint: "#AABBCC" })).toEqual({
      density: 25,
      mood: "calm",
      tint: "#AABBCC",
      word: "hi",
    });
  });
});

describe("no pixel change: the registry matches today's renderers", () => {
  it("button surfaces match both apps' getButtonBaseStyle", () => {
    for (const n of LEGACY_IDS) {
      const entry = findEffect(legacyEffectId("buttonStyle", n))!;
      expect(classOf(entry)).toBe(publicStyles.getButtonBaseStyle(n));
      expect(classOf(entry)).toBe(editorStyles.getButtonBaseStyle(n));
    }
  });

  it("containers match both apps' getContainerStyle", () => {
    for (const n of LEGACY_IDS) {
      const entry = findEffect(legacyEffectId("containerStyle", n))!;
      expect(classOf(entry)).toBe(publicStyles.getContainerStyle(n));
      expect(classOf(entry)).toBe(editorStyles.getContainerStyle(n));
    }
  });

  it("hover effects match the public page (the editor's drift is fixed in 1b)", () => {
    for (const n of LEGACY_IDS) {
      const entry = findEffect(legacyEffectId("buttonEffect", n))!;
      expect(classOf(entry)).toBe(publicStyles.getButtonEffectStyle(n));
    }
  });

  it("name effects match the public page, playing and paused", () => {
    for (const n of LEGACY_IDS) {
      const entry = findEffect(legacyEffectId("heroEffect", n))!;
      expect(classOf(entry)).toBe(publicStyles.getHeroEffectStyle(n));
      const looping = publicStyles.LOOPING_HERO_EFFECTS.includes(n);
      expect(entry.loop === true).toBe(looping);
      if (looping && entry.render.kind === "class") {
        expect(entry.render.settledClassName).toBe(publicStyles.getHeroEffectStyle(n, true));
      }
    }
  });

  it("out of range v1 values render what v1 renders", () => {
    for (const n of [-1, 10, 42, 1.5, undefined]) {
      expect(classOf(findEffect(legacyEffectId("buttonStyle", n))!)).toBe(
        publicStyles.getButtonBaseStyle(n)
      );
      expect(classOf(findEffect(legacyEffectId("containerStyle", n))!)).toBe(
        publicStyles.getContainerStyle(n)
      );
      expect(classOf(findEffect(legacyEffectId("buttonEffect", n))!)).toBe(
        publicStyles.getButtonEffectStyle(n)
      );
      expect(classOf(findEffect(legacyEffectId("heroEffect", n))!)).toBe(
        n === undefined ? "" : publicStyles.getHeroEffectStyle(n)
      );
    }
  });

  it("particle overlays play the v1 preset at their default params", () => {
    // Phase 1c deleted both apps' particleConfigs.ts; PARTICLE_PRESETS is the
    // one copy and the old renderers read it (scenes.particles.ts)
    for (const n of LEGACY_IDS.slice(1)) {
      const entry = findEffect(legacyEffectId("particlesEffect", n))!;
      expect(entry.render.kind).toBe("particles");
      if (entry.render.kind === "particles") {
        const colors = {
          button: "#000000",
          buttonText: "#ffffff",
          container: "#ffffff",
          text: "#000000",
        };
        expect(entry.render.options(clampParams(entry), colors)).toEqual(
          toV4Options(PARTICLE_PRESETS[n]!)
        );
      }
    }
  });
});
