/**
 * The gateway end to end inside workerd, with the local R2, KV, Durable Object and
 * Cache API bindings (spec 3.6). Each test uses its own public id, so cached
 * copies from one test never answer another.
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  runDurableObjectAlarm,
  runInDurableObject,
  waitOnExecutionContext,
} from "cloudflare:test";
import type { MediaTokenPayload } from "@repo/constants/src/mediaToken";
import { handle } from "../src/index";
import { pathForKey } from "../src/path";
import { nowSeconds, signForTest } from "./sign";

const ORIGIN = "https://media.test";
let counter = 0;

/** A fresh 16 character public id per test. */
function newPublicId(): string {
  counter += 1;
  return `t${String(counter).padStart(3, "0")}${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`;
}

async function put(key: string, body: string, contentType = "audio/mp4"): Promise<void> {
  await env.CONTENT.put(key, body, { httpMetadata: { contentType } });
}

async function urlFor(key: string, overrides: Partial<MediaTokenPayload> = {}): Promise<string> {
  const token = await signForTest({
    k: key,
    r: "audio",
    exp: nowSeconds() + 300,
    dl: 0,
    ...overrides,
  });
  return `${ORIGIN}${pathForKey(key)}?t=${encodeURIComponent(token)}`;
}

/** Bodies here are short ASCII stand ins for media files. */
async function read(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer());
}

async function call(url: string, init: RequestInit = {}, gatewayEnv: Env = env): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await handle(new Request(url, init), gatewayEnv, ctx);
  // Let cache writes finish so the next request can see them
  await waitOnExecutionContext(ctx);
  return response;
}

describe("serving", () => {
  it("streams an object with locked down headers", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const response = await call(await urlFor(key));
    expect(response.status).toBe(200);
    expect(await read(response)).toBe("0123456789");
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "audio/mp4",
      "content-length": "10",
      "accept-ranges": "bytes",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "cross-origin",
      "referrer-policy": "no-referrer",
    });
    expect(response.headers.get("cache-control")).toMatch(/^private, max-age=(29\d|300)$/);
    expect(response.headers.get("etag")).toBeTruthy();
    expect(response.headers.has("content-disposition")).toBe(false);
  });

  it("never serves a stored HTML or SVG type as such", async () => {
    const key = `derived/${newPublicId()}/COVER/640`;
    await put(key, "<svg onload=alert(1)>", "image/svg+xml");
    const response = await call(await urlFor(key, { r: "cover" }));
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("answers HEAD with headers and no body", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "abcdef");
    const response = await call(await urlFor(key), { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("6");
    expect(await read(response)).toBe("");
  });
});

describe("refusals: 403 with no body", () => {
  it("refuses a missing token, a bad token and an expired token", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "x");
    const good = await urlFor(key);
    const bare = `${ORIGIN}${pathForKey(key)}`;
    const expired = await urlFor(key, { exp: nowSeconds() - 1 });
    for (const url of [bare, `${bare}?t=v1.t2.a.b`, expired, `${good}x`]) {
      const response = await call(url);
      expect(response.status).toBe(403);
      expect(await read(response)).toBe("");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("refuses a token used on another path", async () => {
    const [a, b] = [`audio/${newPublicId()}/full.m4a`, `audio/${newPublicId()}/full.m4a`];
    await put(a, "a");
    await put(b, "b");
    const tokenForA = new URL(await urlFor(a)).searchParams.get("t")!;
    const response = await call(`${ORIGIN}${pathForKey(b)}?t=${encodeURIComponent(tokenForA)}`);
    expect(response.status).toBe(403);
  });

  it("refuses unscanned and quarantined keys even with a valid token", async () => {
    for (const prefix of ["incoming", "quarantine"]) {
      const key = `${prefix}/${newPublicId()}/original.pdf`;
      await put(key, "%PDF-1.7", "application/pdf");
      expect((await call(await urlFor(key))).status).toBe(403);
    }
  });

  it("refuses a missing object without saying it is missing", async () => {
    const response = await call(await urlFor(`audio/${newPublicId()}/full.m4a`));
    expect(response.status).toBe(403);
  });

  it("refuses methods other than GET, HEAD and OPTIONS", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    const response = await call(await urlFor(key), { method: "POST", body: "x" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("answers 503 when the keys are not configured", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    const response = await call(await urlFor(key), {}, { ...env, MEDIA_TOKEN_KEYS: "" });
    expect(response.status).toBe(503);
  });
});

describe("takedown", () => {
  it("refuses a blocked item, including from the edge cache", async () => {
    const publicId = newPublicId();
    const key = `audio/${publicId}/full.m4a`;
    await put(key, "cached bytes");
    expect((await call(await urlFor(key))).status).toBe(200);
    await env.TAKEDOWN.put(`blocked:${publicId}`, "copyright");
    expect((await call(await urlFor(key))).status).toBe(403);
  });
});

describe("ranges and conditional requests", () => {
  it("serves one range from R2 with Content-Range", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const response = await call(await urlFor(key), { headers: { Range: "bytes=2-5" } });
    expect(response.status).toBe(206);
    expect(await read(response)).toBe("2345");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
  });

  it("serves a suffix range", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const suffix = await call(await urlFor(key), { headers: { Range: "bytes=-3" } });
    expect([suffix.status, await read(suffix), suffix.headers.get("content-range")]).toEqual([
      206,
      "789",
      "bytes 7-9/10",
    ]);
  });

  it("answers 416 for a range past the end", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const response = await call(await urlFor(key), { headers: { Range: "bytes=50-60" } });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
  });

  it("answers 304 when the viewer already has the current version", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const first = await call(await urlFor(key));
    const etag = first.headers.get("etag")!;
    await read(first);
    const again = await call(await urlFor(key), { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
    expect(await read(again)).toBe("");
  });
});

describe("edge cache", () => {
  it("serves later requests from the cache by the token free key", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "first version");
    const first = await call(await urlFor(key));
    expect(await read(first)).toBe("first version");
    // Remove the object: only the cached copy can answer now
    await env.CONTENT.delete(key);
    const second = await call(await urlFor(key));
    expect(second.status).toBe(200);
    expect(await read(second)).toBe("first version");
    // The viewer still gets the private, short lived policy, not the edge one
    expect(second.headers.get("cache-control")).toMatch(/^private/);
    expect(second.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers ranges from the cache once a range miss has filled it", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "0123456789");
    const miss = await call(await urlFor(key), { headers: { Range: "bytes=0-1" } });
    expect(await read(miss)).toBe("01");
    await env.CONTENT.delete(key);
    const hit = await call(await urlFor(key), { headers: { Range: "bytes=8-9" } });
    expect(hit.status).toBe(206);
    expect(await read(hit)).toBe("89");
  });

  it("still checks every token on a cache hit", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "x");
    await read(await call(await urlFor(key)));
    expect((await call(`${ORIGIN}${pathForKey(key)}`)).status).toBe(403);
  });
});

describe("downloads", () => {
  it("serves a download once, as an attachment", async () => {
    const key = `originals/${newPublicId()}/original.pdf`;
    await put(key, "%PDF-1.7", "application/pdf");
    const url = await urlFor(key, {
      r: "original",
      exp: nowSeconds() + 120,
      dl: 1,
      fn: "Studio notes é.pdf",
      j: `jti${newPublicId()}`,
    });
    const first = await call(url);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Studio notes _.pdf\"; filename*=UTF-8''Studio%20notes%20%C3%A9.pdf"
    );
    await read(first);
    expect((await call(url)).status).toBe(403);
  });

  it("forgets a claim by alarm after the token has expired", async () => {
    const jti = `jti${newPublicId()}`;
    const stub = env.DOWNLOADS.get(env.DOWNLOADS.idFromName(jti));
    expect(await stub.claim(nowSeconds() + 60)).toBe(true);
    expect(await stub.claim(nowSeconds() + 60)).toBe(false);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const stored = await runInDurableObject(stub, async (_instance, state) =>
      state.storage.get("claimedAt")
    );
    expect(stored).toBeUndefined();
  });
});

describe("CORS", () => {
  it("lets the app origins read responses and nobody else", async () => {
    const key = `audio/${newPublicId()}/full.m4a`;
    await put(key, "x");
    const allowed = await call(await urlFor(key), { headers: { Origin: "http://localhost:5173" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(allowed.headers.get("access-control-expose-headers")).toContain("Content-Range");
    const other = await call(await urlFor(key), { headers: { Origin: "https://evil.example" } });
    expect(other.headers.has("access-control-allow-origin")).toBe(false);
    expect(other.headers.get("vary")).toContain("Origin");
  });

  it("answers preflights for the app origins only", async () => {
    const preflight = await call(`${ORIGIN}/audio/x/y`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Headers": "range" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Range");
    const refused = await call(`${ORIGIN}/audio/x/y`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(refused.status).toBe(403);
  });
});
