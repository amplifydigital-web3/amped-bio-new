import {
  GRADIENT_MOODS,
  GRADIENT_PRESETS,
  findBannedTerms,
  gradientCss,
  gradientPresetCss,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Background row (spec 3.5, board 10).

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\s-\\s`);
const HEX = /^#[0-9a-f]{6}$/;
const V1_GRADIENTS = [
  "linear-gradient(to right, #00c6ff, #0072ff)",
  "linear-gradient(to right, #fc466b, #3f5efb)",
  "linear-gradient(to right, #11998e, #38ef7d)",
  "linear-gradient(to right, #f12711, #f5af19)",
];

describe("curated gradients", () => {
  it("ships 40 gradients, 8 per mood, with unique ids and labels", () => {
    expect(GRADIENT_PRESETS).toHaveLength(40);
    for (const mood of GRADIENT_MOODS) {
      expect(GRADIENT_PRESETS.filter(g => g.mood === mood)).toHaveLength(8);
    }
    expect(new Set(GRADIENT_PRESETS.map(g => g.id)).size).toBe(40);
    expect(new Set(GRADIENT_PRESETS.map(g => g.label)).size).toBe(40);
  });

  it("keeps every stop valid: 2 to 4 lowercase hex colors from 0 to 100", () => {
    for (const gradient of GRADIENT_PRESETS) {
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
      expect(gradient.stops.length).toBeLessThanOrEqual(4);
      expect(gradient.stops[0]!.at).toBe(0);
      expect(gradient.stops.at(-1)!.at).toBe(100);
      for (const stop of gradient.stops) expect(stop.color).toMatch(HEX);
      expect(gradient.angle).toBeGreaterThanOrEqual(0);
      expect(gradient.angle).toBeLessThanOrEqual(360);
    }
  });

  it("names gradients in compliant copy with no dashes", () => {
    for (const { label } of GRADIENT_PRESETS) {
      expect(findBannedTerms(label), label).toEqual([]);
      expect(label).not.toMatch(DASHES);
    }
  });

  it("keeps the four v1 gradients as their exact strings", () => {
    const strings = GRADIENT_PRESETS.map(gradientPresetCss);
    for (const css of V1_GRADIENTS) expect(strings).toContain(css);
  });

  it("opens with the ten tiles board 10 shows", () => {
    expect(GRADIENT_PRESETS.slice(0, 10).map(g => g.label)).toEqual([
      "Dawn",
      "Tide",
      "Plum",
      "Mesh summer",
      "Ember",
      "Deep",
      "Sky",
      "Northern",
      "Paper",
      "Mint",
    ]);
  });
});

describe("gradientCss", () => {
  it("writes a linear gradient with stop positions", () => {
    expect(
      gradientCss({
        angle: 160,
        stops: [
          { color: "#071a2b", at: 0 },
          { color: "#2bb2a0", at: 40 },
          { color: "#7a4fd1", at: 100 },
        ],
      })
    ).toBe("linear-gradient(160deg, #071a2b 0%, #2bb2a0 40%, #7a4fd1 100%)");
  });

  it("writes a mesh as four corner blobs over the first color", () => {
    const css = gradientCss({
      angle: 0,
      mesh: true,
      stops: [
        { color: "#111111", at: 0 },
        { color: "#222222", at: 100 },
      ],
    });
    expect(css).toBe(
      "radial-gradient(at 0% 0%, #111111 0px, transparent 55%), " +
        "radial-gradient(at 100% 0%, #222222 0px, transparent 55%), " +
        "radial-gradient(at 100% 100%, #111111 0px, transparent 55%), " +
        "radial-gradient(at 0% 100%, #222222 0px, transparent 55%), #111111"
    );
  });
});

describe("built gradients in the v1 config", () => {
  const built = {
    type: "color" as const,
    value: "linear-gradient(160deg, #071a2b 0%, #2bb2a0 50%, #7a4fd1 100%)",
    label: "Your gradient",
    stops: [
      { color: "#071a2b", at: 0 },
      { color: "#2bb2a0", at: 50 },
      { color: "#7a4fd1", at: 100 },
    ],
    angle: 160,
    drift: true,
    texture: "grain" as const,
  };

  it("passes the schema and drops nothing", () => {
    expect(themeConfigSchema.parse({ background: built }).background).toEqual(built);
  });

  it("rejects five stops, a bad color and a bad texture", () => {
    const five = [...built.stops, { color: "#ffffff", at: 90 }, { color: "#000000", at: 95 }];
    expect(themeConfigSchema.safeParse({ background: { ...built, stops: five } }).success).toBe(
      false
    );
    expect(
      themeConfigSchema.safeParse({
        background: { ...built, stops: [{ color: "red", at: 0 }, built.stops[1]] },
      }).success
    ).toBe(false);
    expect(
      themeConfigSchema.safeParse({ background: { ...built, texture: "noise" } }).success
    ).toBe(false);
  });

  it("upgrades to a v2 gradient base with the exact stops, drift and texture", () => {
    expect(upgradeTheme({ background: built }).scene.base).toEqual({
      type: "gradient",
      stops: built.stops,
      angle: 160,
      mesh: false,
      drift: true,
      texture: "grain",
    });
  });

  it("keeps parsing v1 gradient strings that carry no stops", () => {
    expect(
      upgradeTheme({ background: { type: "color", value: V1_GRADIENTS[0]! } }).scene.base
    ).toMatchObject({
      type: "gradient",
      angle: 90,
      drift: false,
      texture: "none",
    });
  });

  it("carries a texture on an image", () => {
    const image = {
      type: "image" as const,
      value: "https://example.com/a.jpg",
      texture: "dots" as const,
    };
    expect(upgradeTheme({ background: image }).scene.base).toMatchObject({
      type: "image",
      texture: "dots",
    });
  });

  it("stays idempotent", () => {
    const once = upgradeTheme({ background: built });
    expect(upgradeTheme(once)).toEqual(once);
  });
});
