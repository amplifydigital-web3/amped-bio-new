import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_FONT_STYLESHEET } from "@repo/constants";
import { GOOGLE_BASE_FONT_LINK, getBaseFontLink, parseBaseHref } from "./fontDelivery";

// Theme Engine v2 2b PR 2: the root layout's base font link
afterEach(() => vi.unstubAllGlobals());

const answer = (data: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ result: { data } }), { status: 200 }));

describe("getBaseFontLink", () => {
  it("uses the mirror when the API names one", async () => {
    vi.stubGlobal("fetch", answer({ baseHref: "https://usercontent.amped.bio/fonts/base/x.css" }));
    expect(await getBaseFontLink()).toEqual({
      href: "https://usercontent.amped.bio/fonts/base/x.css",
      preconnect: [{ href: "https://usercontent.amped.bio", crossOrigin: "anonymous" }],
    });
  });

  it("keeps Google while delivery is off, the API fails, or the answer is odd", async () => {
    vi.stubGlobal("fetch", answer({ baseHref: null }));
    expect(await getBaseFontLink()).toBe(GOOGLE_BASE_FONT_LINK);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    expect(await getBaseFontLink()).toBe(GOOGLE_BASE_FONT_LINK);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down")))
    );
    expect(await getBaseFontLink()).toBe(GOOGLE_BASE_FONT_LINK);
    expect(GOOGLE_BASE_FONT_LINK.href).toBe(BASE_FONT_STYLESHEET);
  });

  it("only accepts https", () => {
    expect(parseBaseHref({ baseHref: "javascript:alert(1)" })).toBeNull();
    expect(parseBaseHref({ baseHref: "http://x/y.css" })).toBeNull();
    expect(parseBaseHref(null)).toBeNull();
  });
});
