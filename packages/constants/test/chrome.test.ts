import {
  HOVER_SPEED_PARAM,
  NAME_SPEED_PARAM,
  PAGE_BUDGET,
  findEffect,
  listEffects,
  pageCost,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Editor chrome (spec 3.7 and 3.10).

describe("parameter strip params", () => {
  it("gives every name loop a Speed with its cycle, Medium by default", () => {
    for (const entry of listEffects("name").filter(e => e.loop)) {
      expect(entry.params["speed"]).toBe(NAME_SPEED_PARAM);
      expect(entry.loopMs).toBeGreaterThan(0);
    }
    expect(NAME_SPEED_PARAM.default).toBe("medium");
  });

  it("gives the text color effects a Colors choice", () => {
    for (const id of [
      "name.glow",
      "name.shiny",
      "name.gradient-sweep",
      "name.outline",
      "name.shadow-stack",
    ]) {
      expect(Object.keys(findEffect(id)!.params)).toEqual(
        expect.arrayContaining(["palette", "color"])
      );
    }
    // Fixed color effects and entrances take none
    for (const id of ["name.neon", "name.chrome", "name.decrypt"]) {
      expect(Object.keys(findEffect(id)!.params)).not.toContain("palette");
    }
  });

  it("gives every hover but None a Speed that defaults to its own timing", () => {
    for (const entry of listEffects("buttonHover")) {
      if (entry.id === "buttonHover.none") expect(entry.params).toEqual({});
      else expect(entry.params["speed"]).toBe(HOVER_SPEED_PARAM);
    }
    expect(HOVER_SPEED_PARAM.default).toBe("default");
  });
});

describe("params on the v1 config", () => {
  it("accepts small flat param records and refuses large ones", () => {
    expect(
      themeConfigSchema.safeParse({
        heroEffectParams: { speed: "fast" },
        buttonEffectParams: { speed: "slow" },
      }).success
    ).toBe(true);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, i]));
    expect(themeConfigSchema.safeParse({ heroEffectParams: many }).success).toBe(false);
  });

  it("clamps stored params against the picked entry", () => {
    const v2 = upgradeTheme({
      heroEffectId: "name.shiny",
      heroEffectParams: { speed: "warp", palette: "custom", color: "#FF00AA", extra: 1 },
      buttonEffect: 1,
      buttonEffectParams: { speed: "fast" },
    });
    expect(v2.name.params).toEqual({ speed: "medium", palette: "custom", color: "#FF00AA" });
    expect(v2.buttonHover.params).toEqual({ speed: "fast" });
  });

  it("leaves pages without params as they are", () => {
    const v2 = upgradeTheme({ heroEffect: 6, buttonEffect: 2 });
    expect(v2.name.params).toEqual({});
    expect(v2.buttonHover.params).toEqual({});
  });
});

describe("pageCost (decision 1)", () => {
  it("is still when nothing moves", () => {
    expect(pageCost(upgradeTheme({}))).toEqual({ points: 0, level: "still", parts: [] });
  });

  it("counts light parts and stays Light within the budget", () => {
    const cost = pageCost(
      upgradeTheme({ particlesEffect: 3, heroEffect: 6, buttonEffect: 1, containerStyle: 1 })
    );
    expect(cost.parts.map(p => p.label)).toEqual(["Snow", "Scale", "Wave"]);
    expect(cost.points).toBe(PAGE_BUDGET);
    expect(cost.level).toBe("light");
  });

  it("goes Heavy over the budget, and counts drift", () => {
    const cost = pageCost(
      upgradeTheme({
        particlesEffect: 3,
        heroEffect: 6,
        buttonEffect: 1,
        buttonPressId: "buttonPress.ripple",
        background: {
          type: "color",
          value: "linear-gradient(90deg, #111111, #222222)",
          stops: [
            { color: "#111111", at: 0 },
            { color: "#222222", at: 100 },
          ],
          angle: 90,
          drift: true,
        },
      })
    );
    expect(cost.parts.map(p => p.label)).toEqual(["Drift", "Snow", "Scale", "Ripple", "Wave"]);
    expect(cost.level).toBe("heavy");
  });

  it("skips the retired Matrix, which plays nothing", () => {
    expect(pageCost(upgradeTheme({ particlesEffect: 6 })).parts).toEqual([]);
  });
});
