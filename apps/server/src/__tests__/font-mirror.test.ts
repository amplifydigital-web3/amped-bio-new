/**
 * Theme Engine v2 fonts, phase 2b PR 2 (spec 3.8): the WOFF2 metrics reader,
 * the metric matched fallback face, and the font mirror (Google fetches and R2
 * writes faked).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";
import { BASE_FONT_STYLESHEET, fontCssKey, fontStylesheetHref } from "@repo/constants";

vi.mock("@repo/database", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { env } from "../env";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { setR2ClientForTests } from "../services/cloudflare/r2";
import { fallbackFace, woff2Metrics } from "../services/fonts/woff2Metrics";
import {
  baseFontHref,
  ensureMirrored,
  fallbackKind,
  fontDeliveryOn,
  mirrorStylesheet,
  publicFontLinks,
  resetFontMirrorForTests,
} from "../services/fonts/fontMirror";

const FIXTURES = join(__dirname, "fixtures", "fonts");
const FIGTREE = new Uint8Array(readFileSync(join(FIXTURES, "figtree-latin-400-normal.woff2")));
const LORA = new Uint8Array(readFileSync(join(FIXTURES, "lora-latin-400-normal.woff2")));
const MEDIA = "https://usercontent.amped.bio";

describe("woff2Metrics", () => {
  it("reads head, hhea and OS/2 from Figtree", () => {
    expect(woff2Metrics(FIGTREE)).toMatchObject({
      unitsPerEm: 1000,
      ascender: 950,
      descender: -250,
    });
    expect(woff2Metrics(FIGTREE)!.xAvgCharWidth).toBeGreaterThan(400);
  });

  it("reads a serif family", () => {
    const m = woff2Metrics(LORA)!;
    expect(m.unitsPerEm).toBeGreaterThan(0);
    expect(m.ascender).toBeGreaterThan(0);
    expect(m.descender).toBeLessThan(0);
  });

  it("returns null for anything that is not WOFF2", () => {
    expect(woff2Metrics(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(woff2Metrics(new TextEncoder().encode("wOF2 but truncated"))).toBeNull();
  });
});

describe("fallbackFace", () => {
  it("scales the local font to the family", () => {
    const face = fallbackFace("Figtree", woff2Metrics(FIGTREE)!, "sans");
    expect(face).toContain('font-family:"Figtree Fallback"');
    expect(face).toContain('src:local("Arial")');
    expect(face).toMatch(/size-adjust:\d+\.\d{2}%/);
    expect(face).toMatch(/ascent-override:\d+\.\d{2}%/);
    expect(face).toMatch(/descent-override:\d+\.\d{2}%/);
    expect(face).toMatch(/line-gap-override:\d+\.\d{2}%/);
  });

  it("picks the local font by kind", () => {
    expect(fallbackFace("Lora", woff2Metrics(LORA)!, "serif")).toContain("Times New Roman");
    expect(fallbackKind("Lora")).toBe("serif");
    expect(fallbackKind("Playfair Display")).toBe("serif");
    expect(fallbackKind("PT Sans")).toBe("sans");
    expect(fallbackKind("Source Serif 4")).toBe("serif");
    expect(fallbackKind("Noto Sans Mono")).toBe("mono");
    expect(fallbackKind("Inter")).toBe("sans");
  });
});

// A fake bucket: HeadObject throws for missing keys, PutObject stores
interface Stored {
  body: Uint8Array | string;
  contentType: string | undefined;
  cacheControl: string | undefined;
}
let bucket: Map<string, Stored>;

function fakeR2(): S3Client {
  return {
    send: vi.fn(async (command: { constructor: { name: string }; input: Record<string, any> }) => {
      const key = command.input.Key as string;
      if (command.constructor.name === "HeadObjectCommand") {
        if (!bucket.has(key)) throw Object.assign(new Error("NotFound"), { name: "NotFound" });
        return {};
      }
      if (command.constructor.name === "PutObjectCommand") {
        bucket.set(key, {
          body: command.input.Body,
          contentType: command.input.ContentType,
          cacheControl: command.input.CacheControl,
        });
        return {};
      }
      throw new Error(`unexpected ${command.constructor.name}`);
    }),
  } as unknown as S3Client;
}

const FIGTREE_URL = "https://fonts.gstatic.com/s/figtree/v1/figtree-latin.woff2";
const FIGTREE_EXT_URL = "https://fonts.gstatic.com/s/figtree/v1/figtree-latin-ext.woff2";

function googleCss(): string {
  return [
    "/* latin-ext */",
    `@font-face { font-family: 'Figtree'; font-style: normal; font-weight: 400; src: url(${FIGTREE_EXT_URL}) format('woff2'); }`,
    "/* latin */",
    `@font-face { font-family: 'Figtree'; font-style: normal; font-weight: 400; src: url(${FIGTREE_URL}) format('woff2'); }`,
  ].join("\n");
}

let fetchMock: ReturnType<typeof vi.fn>;
const saved = { ...env };

beforeEach(() => {
  bucket = new Map();
  resetFontMirrorForTests();
  setR2ClientForTests(fakeR2());
  __setFeatureFlagOverridesForTests({ fontDelivery: true });
  Object.assign(env, {
    MEDIA_GATEWAY_ORIGIN: MEDIA,
    CF_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "media",
  });
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("https://fonts.googleapis.com/css2?")) {
      return new Response(googleCss(), { status: 200, headers: { "content-type": "text/css" } });
    }
    if (url === FIGTREE_URL || url === FIGTREE_EXT_URL) {
      return new Response(FIGTREE, { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setR2ClientForTests(null);
  __setFeatureFlagOverridesForTests({});
  Object.assign(env, saved);
});

const BODY_URL = fontStylesheetHref([{ family: "Outfit", weight: 400 }])!;

describe("fontDeliveryOn", () => {
  it("needs the flag, the media host and R2", () => {
    expect(fontDeliveryOn()).toBe(true);
    __setFeatureFlagOverridesForTests({ fontDelivery: false });
    expect(fontDeliveryOn()).toBe(false);
    __setFeatureFlagOverridesForTests({ fontDelivery: true });
    Object.assign(env, { MEDIA_GATEWAY_ORIGIN: "" });
    expect(fontDeliveryOn()).toBe(false);
  });
});

describe("mirrorStylesheet", () => {
  it("copies each file content addressed and rewrites the CSS to the media host", async () => {
    const css = await mirrorStylesheet(BODY_URL);
    const hash = createHash("sha256").update(FIGTREE).digest("hex");
    const fileKey = `fonts/files/${hash}.woff2`;
    expect(bucket.get(fileKey)?.contentType).toBe("font/woff2");
    expect(bucket.get(fileKey)?.cacheControl).toContain("immutable");
    expect(css).not.toContain("fonts.gstatic.com");
    expect(css).toContain(`${MEDIA}/${fileKey}`);
    expect(css).toContain('font-family:"Figtree Fallback"');
    const stored = bucket.get(fontCssKey(BODY_URL));
    expect(stored?.contentType).toMatch(/^text\/css/);
    expect(stored?.body).toBe(css);
  });

  it("asks Google with a browser user agent and no redirects", async () => {
    await mirrorStylesheet(BODY_URL);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers["User-Agent"]).toContain("Chrome");
    expect(init.redirect).toBe("error");
  });

  it("refuses anything that is not a Google stylesheet", async () => {
    await expect(mirrorStylesheet("https://evil.example/css2?family=X")).rejects.toThrow();
    await expect(
      mirrorStylesheet("https://fonts.googleapis.com.evil.example/css2?family=X")
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a stylesheet that names a file off the font host", async () => {
    fetchMock.mockImplementationOnce(
      async () =>
        new Response("@font-face { font-family: 'X'; src: url(https://evil.example/x.woff2); }", {
          status: 200,
        })
    );
    await expect(mirrorStylesheet(BODY_URL)).rejects.toThrow(/off the font host/);
    expect(bucket.size).toBe(0);
  });

  it("refuses an oversized response", async () => {
    fetchMock.mockImplementationOnce(
      async () => new Response("x", { status: 200, headers: { "content-length": "999999999" } })
    );
    await expect(mirrorStylesheet(BODY_URL)).rejects.toThrow(/too large/);
  });
});

describe("ensureMirrored", () => {
  it("starts one background job and reports ready once stored", async () => {
    expect(await ensureMirrored(BODY_URL)).toBe(false);
    expect(await ensureMirrored(BODY_URL, true)).toBe(true);
    const cssFetches = fetchMock.mock.calls.filter(([u]) => String(u).includes("css2?"));
    expect(cssFetches).toHaveLength(1);
    expect(await ensureMirrored(BODY_URL)).toBe(true);
  });

  it("reports false when the mirror fails, and never throws", async () => {
    fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await ensureMirrored(BODY_URL, true)).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});

describe("public links", () => {
  it("are null while delivery is off", async () => {
    __setFeatureFlagOverridesForTests({ fontDelivery: false });
    expect(await baseFontHref()).toBeNull();
    expect(await publicFontLinks(null, { name: "Rob" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("name the base mirror once it is stored", async () => {
    expect(await baseFontHref()).toBeNull();
    await ensureMirrored(BASE_FONT_STYLESHEET, true);
    expect(await baseFontHref()).toBe(`${MEDIA}/${fontCssKey(BASE_FONT_STYLESHEET)}`);
  });

  it("leave out faces not mirrored yet", async () => {
    const theme = { fontFamily: "Lora" } as never;
    expect(await publicFontLinks(theme, { name: "Rob" })).toEqual([]);
  });
});
