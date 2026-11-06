import {
  BORDER_STYLES,
  BORDER_STYLE_LABELS,
  BUTTON_LAYOUTS,
  BUTTON_LAYOUT_LABELS,
  BUTTON_SHAPES,
  BUTTON_SHAPE_LABELS,
  findEffect,
  CONTAINER_SHAPES,
  CONTAINER_SHAPE_LABELS,
  findBannedTerms,
  themeConfigSchema,
  upgradeTheme,
} from "../src/index";

// Theme Engine v2 phase 2, Container row (spec 3.5, board 03).

const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|\\s-\\s`);

describe("surface sub controls", () => {
  it("labels every shape and border in compliant copy", () => {
    const labels = [
      ...CONTAINER_SHAPES.map(s => CONTAINER_SHAPE_LABELS[s]),
      ...BORDER_STYLES.map(b => BORDER_STYLE_LABELS[b]),
      ...BUTTON_SHAPES.map(s => BUTTON_SHAPE_LABELS[s]),
      ...BUTTON_LAYOUTS.map(l => BUTTON_LAYOUT_LABELS[l]),
      findEffect("button.hard-shadow")!.label,
      findEffect("button.hard-shadow")!.description,
    ];
    for (const label of labels) {
      expect(label).toBeTruthy();
      expect(findBannedTerms(label), label).toEqual([]);
      expect(label).not.toMatch(DASHES);
    }
  });

  it("stores shape and border on a v1 config and rejects unknown values", () => {
    const config = { containerStyle: 1, containerShape: "squircle", containerBorder: "glow" };
    expect(themeConfigSchema.parse(config)).toEqual(config);
    expect(themeConfigSchema.safeParse({ containerShape: "star" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ containerBorder: "double" }).success).toBe(false);
  });

  it("upgrades them into the v2 container", () => {
    expect(
      upgradeTheme({ containerStyle: 1, containerShape: "cut", containerBorder: "dashed" })
        .container
    ).toEqual({ id: "container.frosted", params: {}, shape: "cut", border: "dashed" });
  });

  it("keeps the v1 defaults when they are unset", () => {
    expect(upgradeTheme({ containerStyle: 1 }).container).toMatchObject({
      shape: "rounded",
      border: "none",
    });
    expect(upgradeTheme({ containerStyle: 8 }).container.shape).toBe("arch");
  });

  it("drops a value that slipped past the schema instead of throwing", () => {
    const loose = { containerStyle: 1, containerShape: "star" } as never;
    expect(upgradeTheme(loose).container.shape).toBe("rounded");
  });

  it("stays idempotent", () => {
    const once = upgradeTheme({
      containerStyle: 2,
      containerShape: "blob",
      containerBorder: "thick",
    });
    expect(upgradeTheme(once)).toEqual(once);
  });
});

// Theme Engine v2 phase 2, Buttons row (spec 3.5, board 07).

describe("button sub controls", () => {
  const built = {
    buttonStyle: 3,
    buttonStyleId: "button.hard-shadow",
    buttonShape: "ticket",
    buttonBorder: "thick",
    buttonLayout: "split",
  } as const;

  it("ships Hard shadow as a core v2 style with no v1 integer", () => {
    expect(findEffect("button.hard-shadow")).toMatchObject({
      layer: "button",
      tier: "core",
      cost: "still",
      addedIn: 2,
    });
    expect(findEffect("button.hard-shadow")!.legacyId).toBeUndefined();
  });

  it("stores style, shape, border and layout on a v1 config", () => {
    expect(themeConfigSchema.parse(built)).toEqual(built);
    expect(themeConfigSchema.safeParse({ buttonStyleId: "button.rocket" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ buttonShape: "blob" }).success).toBe(false);
    expect(themeConfigSchema.safeParse({ buttonLayout: "grid" }).success).toBe(false);
  });

  it("upgrades them into the v2 button, the stored style winning over the integer", () => {
    expect(upgradeTheme(built).button).toEqual({
      id: "button.hard-shadow",
      params: {},
      shape: "ticket",
      border: "thick",
      layout: "split",
    });
  });

  it("keeps the v1 defaults when they are unset", () => {
    expect(upgradeTheme({ buttonStyle: 4 }).button).toMatchObject({
      id: "button.glass",
      shape: "rounded",
      border: "none",
      layout: "label",
    });
    expect(upgradeTheme({ buttonStyle: 1 }).button.shape).toBe("pill");
  });

  it("ignores a stored id from another layer", () => {
    const loose = { buttonStyle: 2, buttonStyleId: "container.frosted" } as never;
    expect(upgradeTheme(loose).button.id).toBe("button.outline");
  });

  it("stays idempotent", () => {
    const once = upgradeTheme(built);
    expect(upgradeTheme(once)).toEqual(once);
  });
});
