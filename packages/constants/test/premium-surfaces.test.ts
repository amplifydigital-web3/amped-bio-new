import { findEffect, pageCost, themeConfigSchema, upgradeTheme } from "../src/index";

// Theme Engine v2 phase 3d (TE-3d): Liquid glass, Electric border, Star border
// and Spotlight on containers, Specular on buttons.

const IDS = [
  "container.liquid-glass",
  "container.electric-border",
  "container.star-border",
  "container.spotlight",
  "button.specular",
];

describe("premium surfaces", () => {
  it("are Plus, light, css entries new in v2 with no v1 integer", () => {
    for (const id of IDS) {
      const entry = findEffect(id)!;
      expect(entry, id).toBeDefined();
      expect(entry).toMatchObject({ tier: "plus", cost: "light", engine: "css", addedIn: 2 });
      expect(entry.legacyId).toBeUndefined();
      expect(entry.render.kind).toBe("class");
    }
    expect(findEffect("button.specular")!.pointer).toBe("fine");
  });

  it("stores a surface by id with its params on a v1 config", () => {
    const config = {
      containerStyle: 1,
      containerStyleId: "container.liquid-glass",
      containerParams: { blur: 8, refraction: 70 },
    };
    expect(themeConfigSchema.parse(config)).toEqual(config);
    expect(themeConfigSchema.safeParse({ containerStyleId: "container.nope" }).success).toBe(false);
  });

  it("upgrades the stored id over the v1 integer and clamps its params", () => {
    const v2 = upgradeTheme({
      containerStyle: 1,
      containerStyleId: "container.liquid-glass",
      containerParams: { blur: 99, refraction: -5, junk: 3 },
    });
    expect(v2.container.id).toBe("container.liquid-glass");
    expect(v2.container.params).toEqual({ blur: 21, refraction: 0 });
    // Without the id, the v1 integer still decides
    expect(upgradeTheme({ containerStyle: 1 }).container.id).toBe("container.frosted");
    // A button id for the container is ignored
    expect(
      upgradeTheme({ containerStyle: 9, containerStyleId: "container.none" }).container.id
    ).toBe("container.none");
  });

  it("counts as one light part in the page cost", () => {
    const v2 = upgradeTheme({
      containerStyleId: "container.spotlight",
      buttonStyleId: "button.specular",
    });
    const cost = pageCost(v2);
    expect(cost.parts.map(p => p.label)).toEqual(["Spotlight", "Specular"]);
    expect(cost.level).toBe("light");
  });
});
