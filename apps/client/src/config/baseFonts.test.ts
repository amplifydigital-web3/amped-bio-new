import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_FONT_STYLESHEET } from "@repo/constants";
import { setFeatureFlagOverridesForTests } from "./featureFlags";
import { linkBaseFonts, parseBaseHref } from "./baseFonts";

// Theme Engine v2 2b PR 2: the editor's base font link
const stylesheets = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(l => l.href);

beforeEach(() => {
  document.head.innerHTML = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  setFeatureFlagOverridesForTests({});
});

describe("linkBaseFonts", () => {
  it("links Google while fontDelivery is off, without asking the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setFeatureFlagOverridesForTests({ fontDelivery: false });
    await linkBaseFonts();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stylesheets()).toEqual([BASE_FONT_STYLESHEET]);
  });

  it("links the mirror when the flag is on and the API names one", async () => {
    const href = "https://usercontent.amped.bio/fonts/base/x.css";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: { data: { baseHref: href } } })))
    );
    setFeatureFlagOverridesForTests({ fontDelivery: true });
    await linkBaseFonts();
    expect(stylesheets()).toEqual([href]);
  });

  it("falls back to Google when the mirror is not ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: { data: { baseHref: null } } })))
    );
    setFeatureFlagOverridesForTests({ fontDelivery: true });
    await linkBaseFonts();
    expect(stylesheets()).toEqual([BASE_FONT_STYLESHEET]);
  });

  it("only accepts https", () => {
    expect(parseBaseHref({ baseHref: "data:text/css,x" })).toBeNull();
  });
});
