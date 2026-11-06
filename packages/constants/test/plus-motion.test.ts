import { describe, expect, it } from "vitest";
import {
  findEffect,
  hoverStrengthFactor,
  hoverStrengthVars,
  pageCost,
  rotatingWords,
  upgradeTheme,
} from "../src";

// Theme Engine v2 phase 3e (spec 3.5, boards 08 and 09): Plus hovers, Jelly
// press, hover Strength, Rotating words, Circular and Depth parallax

describe("Plus hovers", () => {
  it("are Plus, pointer only, with Speed and Strength", () => {
    for (const id of ["buttonHover.magnet", "buttonHover.lift-tilt", "buttonHover.jelly"]) {
      const entry = findEffect(id)!;
      expect(entry.tier).toBe("plus");
      expect(entry.pointer).toBe("fine");
      expect(Object.keys(entry.params)).toEqual(["speed", "strength"]);
      expect(entry.cost).toBe("light");
    }
    expect(findEffect("buttonHover.magnet")!.engine).toBe("waapi");
    expect(findEffect("buttonHover.lift-tilt")!.engine).toBe("css");
  });

  it("Lift and tilt draws the spec transform at the default Strength", () => {
    const entry = findEffect("buttonHover.lift-tilt")!;
    if (entry.render.kind !== "class") throw new Error("class");
    expect(entry.render.className).toContain(
      "[transform:perspective(377px)_rotateX(var(--amped-hover-tilt,8deg))_translateY(var(--amped-hover-lift,-3px))]"
    );
    expect(hoverStrengthVars("buttonHover.lift-tilt", { strength: 50 })).toEqual({
      "--amped-hover-tilt": "8deg",
      "--amped-hover-lift": "-3px",
    });
  });

  it("Jelly squashes to the spec frames over 377 ms", () => {
    const entry = findEffect("buttonHover.jelly")!;
    if (entry.render.kind !== "waapi") throw new Error("waapi");
    const colors = {
      button: "#000000",
      buttonText: "#ffffff",
      container: "#000000",
      text: "#ffffff",
    };
    expect(entry.render.keyframes({ strength: 50 }, colors).map(k => k["transform"])).toEqual([
      "scale(1, 1)",
      "scale(1.12, 0.9)",
      "scale(0.96, 1.04)",
      "scale(1, 1)",
    ]);
    expect(entry.render.options({})["duration"]).toBe(377);
  });
});

describe("Strength", () => {
  it("is 1 at the default and scales from none to twice as far", () => {
    expect(hoverStrengthFactor({})).toBe(1);
    expect(hoverStrengthFactor({ strength: 0 })).toBe(0);
    expect(hoverStrengthFactor({ strength: 100 })).toBe(2);
    expect(hoverStrengthFactor({ strength: 400 })).toBe(2);
  });

  it("sets the shipped values at 50, so saved pages do not change", () => {
    expect(hoverStrengthVars("buttonHover.scale", { strength: 50 })).toEqual({
      "--amped-hover-scale": "1.05",
    });
    expect(hoverStrengthVars("buttonHover.pop", { strength: 50 })).toEqual({
      "--amped-hover-scale": "1.1",
    });
    expect(hoverStrengthVars("buttonHover.slide", {})).toEqual({ "--amped-hover-x": "8px" });
    expect(hoverStrengthVars("buttonHover.glow", {})).toEqual({ "--amped-hover-glow": "15px" });
    expect(hoverStrengthVars("buttonHover.rotate", {})).toEqual({ "--amped-hover-rot": "3deg" });
    expect(hoverStrengthVars("buttonHover.scale", { strength: 100 })).toEqual({
      "--amped-hover-scale": "1.1",
    });
    expect(hoverStrengthVars("buttonHover.bounce", { strength: 100 })).toEqual({});
  });

  it("is stored on v1 hovers and clamped", () => {
    const v2 = upgradeTheme({ buttonEffect: 3, buttonEffectParams: { strength: 250 } });
    expect(v2.buttonHover.params).toEqual({ speed: "default", strength: 100 });
  });
});

describe("Jelly press", () => {
  it("animates the button itself", () => {
    const entry = findEffect("buttonPress.jelly-press")!;
    expect(entry.tier).toBe("plus");
    if (entry.render.kind !== "waapi") throw new Error("waapi");
    expect(entry.render.trigger).toBe("press");
    expect(entry.render.target).toBe("self");
  });
});

describe("Plus name effects", () => {
  it("Rotating words takes a 40 character second line and loops every 2.6 s", () => {
    const entry = findEffect("name.rotating-words")!;
    expect(entry.tier).toBe("plus");
    expect(entry.loop).toBe(true);
    expect(entry.loopMs).toBe(2600);
    const words = entry.params["words"];
    expect(words?.kind === "text" && words.maxLength).toBe(40);
  });

  it("splits the words on commas, trims and caps them", () => {
    expect(rotatingWords(" artist, producer ,, DJ ")).toEqual(["artist", "producer", "DJ"]);
    expect(rotatingWords(undefined)).toEqual([]);
    expect(rotatingWords("a".repeat(60))).toEqual(["a".repeat(40)]);
    expect(rotatingWords("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
  });

  it("Circular is still; Depth parallax is a Showcase pointer effect", () => {
    expect(findEffect("name.circular")!.cost).toBe("still");
    const depth = findEffect("name.depth-parallax")!;
    expect(depth.tier).toBe("showcase");
    expect(depth.pointer).toBe("fine");
  });

  it("count in the page cost", () => {
    const cost = pageCost(
      upgradeTheme({
        buttonEffectId: "buttonHover.magnet",
        buttonPressId: "buttonPress.jelly-press",
        heroEffectId: "name.depth-parallax",
      })
    );
    expect(cost.parts.length).toBeGreaterThanOrEqual(3);
  });
});
