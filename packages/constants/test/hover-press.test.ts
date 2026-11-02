import {
  findBannedTerms,
  findEffect,
  listEffects,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Button hover and press rows (spec 3.5, board 09).

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\s-\\s`);
const NEW_HOVERS = [
  "buttonHover.fill-sweep",
  "buttonHover.underline-grow",
  "buttonHover.border-draw",
  "buttonHover.icon-slide",
  "buttonHover.arrow-nudge",
];

describe("phase 2 hovers and presses", () => {
  it("ships five core hovers with no v1 integer, light and pointer safe", () => {
    for (const id of NEW_HOVERS) {
      const entry = findEffect(id)!;
      expect(entry).toMatchObject({
        layer: "buttonHover",
        tier: "core",
        cost: "light",
        addedIn: 2,
      });
      expect(entry.legacyId).toBeUndefined();
      // Hover classes move only transform, opacity, shadow or a pseudo layer
      expect(entry.render.kind).toBe("class");
    }
  });

  it("ships Ripple and Dip as core presses", () => {
    expect(listEffects("buttonPress").map(e => [e.id, e.engine])).toEqual([
      ["buttonPress.none", "css"],
      ["buttonPress.ripple", "waapi"],
      ["buttonPress.dip", "css"],
    ]);
    const ripple = findEffect("buttonPress.ripple")!;
    expect(ripple.render.kind === "waapi" && ripple.render.trigger).toBe("press");
  });

  it("draws the ripple in the text color at a quarter strength over 377 ms", () => {
    const ripple = findEffect("buttonPress.ripple")!;
    if (ripple.render.kind !== "waapi") throw new Error("ripple is waapi");
    const colors = {
      button: "#111111",
      buttonText: "#ffffff",
      container: "#ffffff",
      text: "#222222",
    };
    const frames = ripple.render.keyframes({}, colors);
    expect(frames[0]).toMatchObject({ opacity: 0.25, backgroundColor: "#222222" });
    expect(frames.at(-1)).toMatchObject({ opacity: 0 });
    expect(ripple.render.options({})).toMatchObject({ duration: 377 });
  });

  it("names them in compliant copy with no dashes", () => {
    for (const id of [...NEW_HOVERS, "buttonPress.ripple", "buttonPress.dip"]) {
      const { label, description } = findEffect(id)!;
      for (const text of [label, description]) {
        expect(findBannedTerms(text), text).toEqual([]);
        expect(text).not.toMatch(DASHES);
      }
    }
  });

  it("stores the hover and press ids on a v1 config", () => {
    const config = {
      buttonEffect: 9,
      buttonEffectId: "buttonHover.fill-sweep",
      buttonPressId: "buttonPress.ripple",
    };
    expect(themeConfigSchema.parse(config)).toEqual(config);
    expect(themeConfigSchema.safeParse({ buttonEffectId: "button.soft" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ buttonPressId: "buttonPress.spin" }).success).toBe(false);
  });

  it("upgrades them, the stored hover winning over the integer", () => {
    const v2 = upgradeTheme({
      buttonEffect: 9,
      buttonEffectId: "buttonHover.fill-sweep",
      buttonPressId: "buttonPress.dip",
    });
    expect(v2.buttonHover.id).toBe("buttonHover.fill-sweep");
    expect(v2.buttonPress.id).toBe("buttonPress.dip");
    expect(upgradeTheme(v2)).toEqual(v2);
  });

  it("keeps v1 hovers and no press when unset, and ignores ids from another layer", () => {
    expect(upgradeTheme({ buttonEffect: 2 }).buttonHover.id).toBe("buttonHover.glow");
    expect(upgradeTheme({}).buttonPress.id).toBe("buttonPress.none");
    const loose = { buttonEffect: 1, buttonEffectId: "buttonPress.dip" } as never;
    expect(upgradeTheme(loose).buttonHover.id).toBe("buttonHover.scale");
  });
});
