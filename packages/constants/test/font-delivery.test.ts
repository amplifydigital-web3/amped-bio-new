import { describe, expect, it } from "vitest";
import {
  BASE_FONT_STYLESHEET,
  FONT_CSS_KEY_PATTERN,
  FONT_FILE_KEY_PATTERN,
  creatorFontRequests,
  fallbackFamily,
  fontCssKey,
  isFontKey,
  isGoogleFontsStylesheet,
  mirroredFontUrl,
  shortHash,
} from "../src";

// Theme Engine v2 fonts, phase 2b PR 2 (spec 3.8): delivery helpers shared by
// the API, the media gateway, the landing page and the editor

describe("isGoogleFontsStylesheet", () => {
  it("accepts css2 URLs with axis syntax", () => {
    expect(isGoogleFontsStylesheet(BASE_FONT_STYLESHEET)).toBe(true);
    expect(
      isGoogleFontsStylesheet(
        "https://fonts.googleapis.com/css2?family=Outfit:wght@400&display=swap"
      )
    ).toBe(true);
  });

  it("refuses other hosts and paths", () => {
    expect(isGoogleFontsStylesheet("https://fonts.googleapis.com.evil.example/css2?family=X")).toBe(
      false
    );
    expect(isGoogleFontsStylesheet("https://evil.example/css2?family=X")).toBe(false);
    expect(isGoogleFontsStylesheet("http://fonts.googleapis.com/css2?family=X")).toBe(false);
    expect(isGoogleFontsStylesheet("https://fonts.googleapis.com/css?family=X")).toBe(false);
    expect(isGoogleFontsStylesheet("https://fonts.googleapis.com/css2?family=X#frag")).toBe(false);
    expect(isGoogleFontsStylesheet("https://fonts.googleapis.com/css2?family=X Y")).toBe(false);
  });
});

describe("storage keys", () => {
  it("are stable, short and match the gateway's patterns", () => {
    expect(shortHash("abc")).toBe(shortHash("abc"));
    expect(shortHash("abc")).not.toBe(shortHash("abd"));
    const base = fontCssKey(BASE_FONT_STYLESHEET);
    expect(base).toMatch(/^fonts\/base\//);
    const lora = fontCssKey("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700");
    expect(lora).toMatch(/^fonts\/playfair-display\/[a-z0-9]+\.css$/);
    for (const key of [base, lora]) {
      expect(FONT_CSS_KEY_PATTERN.test(key)).toBe(true);
      expect(isFontKey(key)).toBe(true);
    }
    const file = `fonts/files/${"a".repeat(64)}.woff2`;
    expect(FONT_FILE_KEY_PATTERN.test(file)).toBe(true);
    expect(isFontKey(file)).toBe(true);
    expect(isFontKey("fonts/../users/1/x.css")).toBe(false);
    expect(isFontKey("users/1/photo.jpg")).toBe(false);
  });

  it("join to the media host without double slashes", () => {
    expect(mirroredFontUrl("https://usercontent.amped.bio/", "fonts/base/x.css")).toBe(
      "https://usercontent.amped.bio/fonts/base/x.css"
    );
  });
});

describe("creatorFontRequests", () => {
  it("asks for nothing beyond the base families on a default theme", () => {
    expect(creatorFontRequests(null, { name: "Rob" })).toEqual([]);
  });

  it("asks for a catalog body face", () => {
    expect(creatorFontRequests({ fontFamily: "Outfit" } as never, { name: "Rob" })).toEqual([
      {
        role: "body",
        url: "https://fonts.googleapis.com/css2?family=Outfit:wght@400&display=swap",
      },
    ]);
  });

  it("asks for only the name's letters, name first", () => {
    const requests = creatorFontRequests(
      { fontFamily: "Outfit", nameFont: { family: "Fraunces", weight: 700 } } as never,
      { name: "Rob" }
    );
    expect(requests.map(r => r.role)).toEqual(["name", "body"]);
    expect(requests[0]!.url).toContain("text=Rbo");
    for (const r of requests) expect(isGoogleFontsStylesheet(r.url)).toBe(true);
  });

  it("names the fallback family", () => {
    expect(fallbackFamily("Lora")).toBe("Lora Fallback");
  });
});
