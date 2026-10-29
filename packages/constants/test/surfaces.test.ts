import {
  BORDER_STYLES,
  BORDER_STYLE_LABELS,
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
