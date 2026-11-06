/**
 * Public fonts (Theme Engine v2 fonts, phase 2b PR 2): fonts/ serves without a
 * token, with open CORS and a year of caching, and only font shaped keys.
 */
import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { handle } from "../src/index";
import { fontKeyFromPath } from "../src/fonts";

const CSS_KEY = "fonts/fraunces/abc1234.css";
const FILE_KEY = `fonts/files/${"a".repeat(64)}.woff2`;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await handle(new Request(`https://usercontent.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("font keys", () => {
  it("accepts mirrored stylesheets and files only", () => {
    expect(fontKeyFromPath(`/${CSS_KEY}`)).toBe(CSS_KEY);
    expect(fontKeyFromPath(`/${FILE_KEY}`)).toBe(FILE_KEY);
    expect(fontKeyFromPath("/fonts/../originals/x.css")).toBeNull();
    expect(fontKeyFromPath("/fonts/%2e%2e/originals/x.css")).toBeNull();
    expect(fontKeyFromPath("/fonts/files/%2e%2e%2foriginals/x.woff2")).toBeNull();
    expect(fontKeyFromPath("/fonts/files/short.woff2")).toBeNull();
    expect(fontKeyFromPath("/fonts/fraunces/abc1234.js")).toBeNull();
    expect(fontKeyFromPath("/originals/abc/file.mp4")).toBeNull();
  });
});

describe("serving fonts", () => {
  it("serves a stylesheet with no token, open CORS and a year of caching", async () => {
    await env.CONTENT.put(CSS_KEY, "@font-face{font-family:'Fraunces'}");
    const response = await call(`/${CSS_KEY}`, { headers: { Origin: "https://amped.bio" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toContain("Fraunces");
  });

  it("serves a font file as font/woff2, and HEAD without a body", async () => {
    await env.CONTENT.put(FILE_KEY, new Uint8Array([119, 79, 70, 50]));
    const get = await call(`/${FILE_KEY}`);
    expect(get.status).toBe(200);
    expect(get.headers.get("Content-Type")).toBe("font/woff2");
    expect(new Uint8Array(await get.arrayBuffer())).toHaveLength(4);
    const head = await call(`/${FILE_KEY}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("Content-Length")).toBe("4");
  });

  it("answers 404 with no caching for a stylesheet not mirrored yet", async () => {
    const response = await call("/fonts/lora/zzzzzzz.css");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("still refuses token free reads outside fonts/", async () => {
    expect((await call("/originals/abc/file.mp4")).status).toBe(403);
  });

  it("cannot be walked out of fonts/ with an encoded path", async () => {
    expect((await call("/fonts/%2e%2e/originals/abc/file.mp4")).status).toBe(403);
    expect((await call("/fonts/files/%2e%2e%2f%2e%2e%2foriginals/x.woff2")).status).toBe(403);
  });
});
