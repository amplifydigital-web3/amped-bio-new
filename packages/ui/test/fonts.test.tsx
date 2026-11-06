import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { upgradeTheme, type ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { creatorFontHrefs } from "../src/creator/fonts";
import { lookFor, v1Values } from "../src/creator/look";

// Theme Engine v2 phase 2b, fonts PR 1 (spec 3.8): the name face, the body
// style and the font links on the shared CreatorPage.

const PROFILE = { name: "Maya Rivera", bio: "Night sky photographer." };

const CATALOG: ThemeConfig = {
  fontFamily: "Figtree",
  fontColor: "#16152b",
  nameFont: { family: "Fraunces", weight: 800, axes: { opsz: 72 } },
  bodyFontStyle: { weight: 500, italic: true },
};

const page = (theme: ThemeConfig | ReturnType<typeof upgradeTheme>, loadFonts = false) =>
  renderToStaticMarkup(
    <CreatorPage theme={theme} mode="public" profile={PROFILE} loadFonts={loadFonts} />
  );

function h1(html: string) {
  return html.match(/<h1[^>]*>/)?.[0] ?? "";
}

describe("name and body faces", () => {
  it("draws a v1 theme exactly as before: no name face, no body style, no links", () => {
    const theme: ThemeConfig = { fontFamily: "Lora", fontColor: "#222222" };
    const look = lookFor(theme);
    expect(look.nameFace).toBeNull();
    expect(look.bodyFace).toEqual({});
    const html = page(theme, true);
    expect(h1(html)).toContain("font-family:Lora");
    expect(h1(html)).not.toContain("font-weight");
    expect(html).not.toContain("<link");
  });

  it("puts the name face on the name and the body style on the bio", () => {
    const html = page(CATALOG);
    expect(h1(html)).toContain(
      "font-family:&quot;Fraunces&quot;, &quot;Fraunces Fallback&quot;, sans-serif"
    );
    expect(h1(html)).toContain("font-weight:800");
    expect(h1(html)).toContain("font-variation-settings:&quot;opsz&quot; 72");
    const bio = html.match(/<p[^>]*>Night sky/)?.[0] ?? "";
    expect(bio).toContain("font-family:Figtree");
    expect(bio).toContain("font-weight:500");
    expect(bio).toContain("font-style:italic");
  });

  it("reads the same from a v2 config and writes it back to the v1 fields", () => {
    const v2 = upgradeTheme(CATALOG);
    expect(h1(page(v2))).toBe(h1(page(CATALOG)));
    const back = v1Values(v2);
    expect(back.nameFont).toEqual(CATALOG.nameFont);
    expect(back.bodyFontStyle).toEqual(CATALOG.bodyFontStyle);
    expect(v1Values(upgradeTheme({ fontFamily: "Lora" })).nameFont).toBeUndefined();
  });
});

describe("font links", () => {
  it("loads nothing unless the page asks for fonts", () => {
    expect(page(CATALOG)).not.toContain("<link");
  });

  it("asks for the name letters only, and the body face whole", () => {
    const hrefs = creatorFontHrefs(CATALOG, PROFILE);
    expect(hrefs).toHaveLength(2);
    expect(hrefs[0]).toContain("family=Fraunces:opsz,wght@72,800");
    expect(hrefs[0]).toContain("&text=");
    expect(hrefs[1]).toContain("family=Figtree:ital,wght@1,500");
    expect(hrefs[1]).not.toContain("text=");
    const html = page(CATALOG, true);
    expect(html.match(/<link rel="stylesheet"/g)).toHaveLength(2);
  });

  it("adds the bio letters when the name effect also dresses the bio", () => {
    const withBio: ThemeConfig = {
      ...CATALOG,
      heroEffectId: "name.shiny",
      heroAppliesTo: "nameAndBio",
    };
    const text = decodeURIComponent(creatorFontHrefs(withBio, PROFILE)[0].split("text=")[1]);
    expect(text).toContain("p");
    expect(text).toContain("h");
  });

  it("needs no link for a base family at a base weight", () => {
    expect(creatorFontHrefs({ fontFamily: "Inter" }, PROFILE)).toEqual([]);
  });
});
