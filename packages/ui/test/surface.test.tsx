import { renderToStaticMarkup } from "react-dom/server";
import { upgradeTheme, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { lookFor } from "../src/creator/look";
import {
  BORDER_STYLE_CLASSES,
  CONTAINER_SHAPE_CLASSES,
  containerShapeClass,
  containerSurfaceClass,
} from "../src/creator/surface";
import * as publicStyles from "../../../apps/landingpage/src/lib/styles";

// Theme Engine v2 phase 2, Container row: shape and border over the surface.

const PROFILE = { name: "Maya Rivera" };
// A full v1 color and font set, so the v1 and v2 shapes resolve to the same values
const COLORS: ThemeConfig = {
  buttonColor: "#007523",
  containerColor: "#118901",
  fontColor: "#ffffff",
  fontFamily: "Roboto",
  fontSize: "16px",
  transparency: 45,
  background: { type: "color", value: "#101820" },
};
const page = (theme: ThemeConfig) =>
  renderToStaticMarkup(<CreatorPage theme={theme} mode="public" profile={PROFILE} />);

describe("container surface classes", () => {
  it("adds nothing for Rounded and None, so saved pages keep their look", () => {
    expect(CONTAINER_SHAPE_CLASSES.rounded).toBe("");
    expect(BORDER_STYLE_CLASSES.none).toBe("");
    for (const style of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(containerSurfaceClass(lookFor({ containerStyle: style }))).toBe("");
    }
  });

  it("shapes nothing without a surface, and leaves the retired Arch arched", () => {
    expect(containerShapeClass("container.none", "pill")).toBe("");
    expect(
      containerSurfaceClass(
        lookFor({ containerStyle: 0, containerShape: "pill", containerBorder: "glow" })
      )
    ).toBe("");
    expect(containerShapeClass("container.arch", "arch")).toBe("");
    expect(containerShapeClass("container.frosted", "arch")).toBe(CONTAINER_SHAPE_CLASSES.arch);
  });

  it("joins the shape and the border", () => {
    expect(
      containerSurfaceClass(
        lookFor({ containerStyle: 1, containerShape: "squircle", containerBorder: "glow" })
      )
    ).toBe(`${CONTAINER_SHAPE_CLASSES.squircle} ${BORDER_STYLE_CLASSES.glow}`);
  });
});

describe("CreatorPage container", () => {
  it("draws v1 surfaces exactly as before", () => {
    expect(page({ containerStyle: 9 })).toContain(
      `class="w-full p-[21px] sm:p-[34px] ${publicStyles.getContainerStyle(9)}"`
    );
  });

  it("lets the shape replace the surface radius and the glow replace its shadow", () => {
    const html = page({ containerStyle: 9, containerShape: "pill", containerBorder: "glow" });
    expect(html).toContain("rounded-[89px]");
    expect(html).not.toContain("rounded-3xl");
    expect(html).toContain("shadow-[0_0_21px_var(--amped-glow)]");
    expect(html).not.toContain("shadow-[0_35px_60px_-15px_rgba(0,0,0,0.2)]");
  });

  it("lets a hairline replace the double border's own border", () => {
    const html = page({ containerStyle: 5, containerBorder: "hairline" });
    expect(html).not.toContain("border-2 ");
    expect(html).toContain(
      "border-[color:color-mix(in_srgb,var(--amped-font,#000000)_24%,transparent)]"
    );
  });

  it("renders a v2 config the same as the v1 config it came from", () => {
    const v1: ThemeConfig = {
      ...COLORS,
      containerStyle: 1,
      containerShape: "cut",
      containerBorder: "gradient",
    };
    expect(page(upgradeTheme(v1) as never)).toBe(page(v1));
  });
});
