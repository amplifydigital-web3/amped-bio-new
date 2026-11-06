import { describe, expect, it } from "vitest";
import {
  CURSOR_EFFECTS,
  findEffect,
  pageCost,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 3c (spec 3.5 and 3.7): the Cursor row, Click spark and Fuzzy text.

describe("cursor entries", () => {
  it("ships None, five Plus canvas cursors and two Showcase, Heavy cursors", () => {
    expect(CURSOR_EFFECTS.map(e => [e.id, e.tier, e.engine, e.cost])).toEqual([
      ["cursor.none", "core", "css", "still"],
      ["cursor.glow", "plus", "canvas", "light"],
      ["cursor.ring", "plus", "canvas", "light"],
      ["cursor.spark-trail", "plus", "canvas", "light"],
      ["cursor.pixel-trail", "plus", "canvas", "light"],
      ["cursor.dot-trail", "plus", "canvas", "light"],
      ["cursor.blob", "showcase", "webgl", "heavy"],
      ["cursor.splash", "showcase", "canvas", "heavy"],
    ]);
  });

  it("marks every cursor effect fine pointer only, of Amped's own", () => {
    for (const entry of CURSOR_EFFECTS.slice(1)) {
      expect(entry.pointer).toBe("fine");
      expect(entry.source).toBe("amped");
    }
  });

  it("gives the trails a length of 8 to 34", () => {
    expect(findEffect("cursor.dot-trail")!.params["length"]).toMatchObject({ min: 8, max: 34 });
  });
});

describe("Click spark and Fuzzy text", () => {
  it("adds Click spark as a Plus canvas press", () => {
    expect(findEffect("buttonPress.click-spark")).toMatchObject({
      tier: "plus",
      engine: "canvas",
      render: { kind: "canvas", module: "click-spark" },
    });
  });

  it("adds Fuzzy text as a Plus canvas name effect with Strength and Speed", () => {
    const fuzzy = findEffect("name.fuzzy")!;
    expect(fuzzy).toMatchObject({ tier: "plus", engine: "canvas", cost: "light" });
    expect(Object.keys(fuzzy.params)).toEqual(["strength", "speed"]);
    expect(fuzzy.loop).toBeUndefined();
  });
});

describe("cost and storage", () => {
  const base = { background: { type: "color" as const, value: "#101010" } };

  it("counts Splash as two heavy effects, one part", () => {
    const cost = pageCost(upgradeTheme({ ...base, cursorEffectId: "cursor.splash" }));
    expect(cost.parts).toHaveLength(1);
    expect(cost.points).toBe(6);
    expect(cost.level).toBe("heavy");
    expect(pageCost(upgradeTheme({ ...base, cursorEffectId: "cursor.blob" })).points).toBe(3);
  });

  it("upgrades the stored cursor with clamped params, and None otherwise", () => {
    const v2 = upgradeTheme({
      ...base,
      cursorEffectId: "cursor.dot-trail",
      cursorParams: { length: 99, palette: "custom", color: "#ff0000" },
    });
    expect(v2.cursor).toEqual({
      id: "cursor.dot-trail",
      params: { length: 34, palette: "custom", color: "#ff0000" },
    });
    expect(upgradeTheme(base).cursor).toEqual({ id: "cursor.none", params: {} });
  });

  it("accepts cursor ids and refuses other layers' ids", () => {
    expect(themeConfigSchema.safeParse({ cursorEffectId: "cursor.glow" }).success).toBe(true);
    expect(themeConfigSchema.safeParse({ cursorEffectId: "scene.aurora" }).success).toBe(false);
  });
});
