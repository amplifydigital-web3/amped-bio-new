import { renderToStaticMarkup } from "react-dom/server";
import { upgradeTheme, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { CreatorButton } from "../src/creator/creator-button";
import { lookFor } from "../src/creator/look";
import {
  BORDER_STYLE_CLASSES,
  BUTTON_BORDER_CLASSES,
  BUTTON_SHAPE_CLASSES,
  CONTAINER_SHAPE_CLASSES,
  buttonSurfaceClass,
  containerShapeClass,
  containerSurfaceClass,
} from "../src/creator/surface";
import * as publicStyles from "../../../apps/landingpage/src/lib/styles";

// Theme Engine v2 phase 2, Container, Buttons, Hover and press rows: what the
// rows add over the v1 surface and button.

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

// Theme Engine v2 phase 2, Buttons row (board 07).

const button = (theme: ThemeConfig) =>
  renderToStaticMarkup(
    <CreatorButton theme={theme} label="Print shop" href="https://example.com" />
  );

describe("CreatorButton surface and layout", () => {
  it("keeps the v1 button for Rounded, None and Label", () => {
    expect(buttonSurfaceClass(lookFor({ buttonStyle: 4 }))).toBe("");
    expect(buttonSurfaceClass(lookFor({ buttonStyle: 1, buttonShape: "pill" }))).toBe("");
    const html = button({ buttonStyle: 4 });
    expect(html).toContain("text-center");
    expect(html).not.toContain("<svg");
  });

  it("draws Hard shadow from its stored id", () => {
    const html = button({ buttonStyle: 3, buttonStyleId: "button.hard-shadow" });
    expect(html).toContain("shadow-[4px_4px_0_var(--amped-btn-dark)]");
    expect(html).not.toContain("shadow-lg");
  });

  it("lets the shape replace the style radius and a thick border use the dark shade", () => {
    const html = button({ buttonStyle: 0, buttonShape: "squircle", buttonBorder: "thick" });
    expect(html).toContain(BUTTON_SHAPE_CLASSES.squircle);
    expect(html).not.toContain("rounded-lg");
    expect(html).toContain(BUTTON_BORDER_CLASSES.thick);
  });

  it("sets the label beside the icon, and adds a chevron for Split", () => {
    expect(button({ buttonLayout: "icon" })).toContain("text-left");
    const split = button({ buttonLayout: "split" });
    expect(split).toContain("text-left");
    expect(split).toContain("lucide-chevron-right");
  });

  it("renders a v2 config the same as the v1 config it came from", () => {
    const v1: ThemeConfig = {
      ...COLORS,
      buttonStyle: 3,
      buttonStyleId: "button.hard-shadow",
      buttonShape: "ticket",
      buttonBorder: "gradient",
      buttonLayout: "split",
    };
    expect(button(upgradeTheme(v1) as never)).toBe(button(v1));
  });
});

// Theme Engine v2 phase 2, Button hover and press rows (board 09).

describe("CreatorButton hover and press", () => {
  it("adds no press classes and no handler by default", () => {
    const html = button({ buttonStyle: 0 });
    expect(html).not.toContain("active:scale-[0.97]");
    expect(html).not.toContain("overflow-hidden");
  });

  it("draws a phase 2 hover from its stored id", () => {
    const html = button({ buttonEffect: 9, buttonEffectId: "buttonHover.fill-sweep" });
    expect(html).toContain("hover:before:scale-x-100");
    expect(html).not.toContain("before:via-white/20");
  });

  it("presses in for Dip and clips the ripple for Ripple", () => {
    expect(button({ buttonPressId: "buttonPress.dip" })).toContain(
      "motion-safe:active:scale-[0.97]"
    );
    expect(button({ buttonPressId: "buttonPress.ripple" })).toContain("relative overflow-hidden");
  });
});
