import {
  findEffect,
  isNameEntrance,
  listEffects,
  nameSettle,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Name row (spec 3.5, board 08).

const NEW_NAMES = [
  "name.shiny",
  "name.gradient-sweep",
  "name.outline",
  "name.chrome",
  "name.shadow-stack",
  "name.focus-in",
  "name.letter-rise",
  "name.type-on",
  "name.decrypt",
];
const ENTRANCES = ["name.focus-in", "name.letter-rise", "name.type-on", "name.decrypt"];

describe("phase 2 name effects", () => {
  it("ships nine core effects after the six v1 effects, with no v1 integer", () => {
    expect(
      listEffects("name")
        .slice(6)
        .map(e => e.id)
    ).toEqual(NEW_NAMES);
    for (const id of NEW_NAMES) {
      const entry = findEffect(id)!;
      expect(entry).toMatchObject({ layer: "name", tier: "core", addedIn: 2 });
      expect(entry.legacyId).toBeUndefined();
      expect(["still", "light"]).toContain(entry.cost);
    }
  });

  it("keeps the retired v1 looks for pages that carry 1, 3, 4 or 5", () => {
    for (const id of ["name.gradient", "name.typewriter", "name.blur-in", "name.split-reveal"]) {
      expect(findEffect(id)!.retired).toBe(true);
    }
  });

  it("fills text with -webkit-text-fill-color, so the inline color cannot win", () => {
    for (const id of ["name.shiny", "name.gradient-sweep", "name.outline", "name.chrome"]) {
      const entry = findEffect(id)!;
      expect(entry.render.kind === "class" && entry.render.className).toContain(
        "[-webkit-text-fill-color:transparent]"
      );
      expect(entry.render.kind === "class" && entry.render.className).not.toContain(
        "text-transparent"
      );
      // The background shorthand resets background-clip and paints a box
      expect(entry.render.kind === "class" && entry.render.className).not.toContain("[background:");
    }
  });

  it("settles looping effects without their animation", () => {
    for (const id of ["name.shiny", "name.gradient-sweep"]) {
      const entry = findEffect(id)!;
      expect(entry.loop).toBe(true);
      if (entry.render.kind !== "class") throw new Error("class entry expected");
      expect(entry.render.settledClassName).not.toMatch(/animate-/);
      expect(entry.render.className).toMatch(/motion-safe:animate-/);
    }
  });

  it("marks the four entrances as one shot text animations of 610 ms or less", () => {
    for (const id of NEW_NAMES) {
      expect(isNameEntrance(findEffect(id)!)).toBe(ENTRANCES.includes(id));
    }
    for (const id of ENTRANCES) {
      const entry = findEffect(id)!;
      if (entry.render.kind !== "waapi") throw new Error("waapi entry expected");
      expect(entry.render.trigger).toBe("mount");
      expect(entry.loop).toBeUndefined();
      expect(Number(entry.render.options({}).duration)).toBeLessThanOrEqual(610);
    }
  });

  it("settles v1 loops as always and new loops as once, unless stored", () => {
    expect(nameSettle(findEffect("name.wave")!)).toBe("always");
    expect(nameSettle(findEffect("name.shiny")!)).toBe("once");
    expect(nameSettle(findEffect("name.shiny")!, "always")).toBe("always");
  });
});

describe("Name row storage on the v1 config", () => {
  it("accepts the optional fields and rejects unknown ids", () => {
    expect(
      themeConfigSchema.safeParse({
        heroEffect: 2,
        heroEffectId: "name.shiny",
        heroEffectLoop: "always",
        heroAppliesTo: "nameAndBio",
      }).success
    ).toBe(true);
    expect(themeConfigSchema.safeParse({ heroEffectId: "name.sparkle" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ heroEffectId: "buttonHover.scale" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ heroEffectLoop: "twice" }).success).toBe(false);
  });

  it("upgrades a stored id over the integer, with settle and target", () => {
    const v2 = upgradeTheme({
      heroEffect: 2,
      heroEffectId: "name.shiny",
      heroEffectLoop: "always",
      heroAppliesTo: "nameAndBio",
    });
    expect(v2.name).toEqual({
      id: "name.shiny",
      params: {},
      loop: "always",
      appliesTo: "nameAndBio",
    });
  });

  it("leaves v1 pages as they are", () => {
    expect(upgradeTheme({ heroEffect: 6 }).name).toEqual({
      id: "name.wave",
      params: {},
      appliesTo: "name",
    });
    // A stored id from another layer falls back to the integer
    expect(upgradeTheme({ heroEffect: 2, heroEffectId: "button.soft" } as never).name.id).toBe(
      "name.glow"
    );
  });
});
