/**
 * The Stream webhook router inside workerd. fetch to the API targets is stubbed,
 * so each test sees exactly which API received the event and with what signature.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import {
  MAX_BODY_BYTES,
  handle,
  signatureFor,
  targetsFor,
  verifySignature,
  type RouterEnv,
} from "../src/index";

const NOW = 1_800_000_000;
const UID = "0123456789abcdef0123456789abcdef";
const routerEnv = env as unknown as RouterEnv;
const encoder = new TextEncoder();

interface Captured {
  url: string;
  body: Uint8Array;
  signature: string | null;
}

function stubTargets(status: number | ((url: string) => number | Error) = 200): Captured[] {
  const captured: Captured[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    const raw = init?.body instanceof Uint8Array ? init.body : new Uint8Array();
    captured.push({ url, body: raw, signature: headers.get("webhook-signature") });
    const answer = typeof status === "function" ? status(url) : status;
    if (answer instanceof Error) throw answer;
    return new Response(null, { status: answer });
  });
  return captured;
}

async function streamRequest(
  payload: unknown,
  options: { secret?: string; time?: number; path?: string; method?: string; raw?: string } = {}
): Promise<Request> {
  const text = options.raw ?? JSON.stringify(payload);
  const bytes = encoder.encode(text);
  const signature = await signatureFor(
    options.secret ?? routerEnv.STREAM_WEBHOOK_SECRET,
    bytes,
    options.time ?? NOW
  );
  return new Request(`https://stream-hooks.test${options.path ?? "/cloudflare-stream"}`, {
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json", "webhook-signature": signature },
    body: options.method === "GET" ? undefined : text,
  });
}

const ready = (meta?: Record<string, string>) => ({
  uid: UID,
  readyToStream: true,
  status: { state: "ready" },
  ...(meta ? { meta } : {}),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("targetsFor", () => {
  it("routes by meta.env and fans out when it is missing", () => {
    expect(targetsFor(ready({ env: "production" }))).toEqual(["production"]);
    expect(targetsFor(ready({ env: "staging" }))).toEqual(["staging"]);
    expect(targetsFor(ready())).toEqual(["production", "staging"]);
    expect(targetsFor(ready({ publicId: "abc" }))).toEqual(["production", "staging"]);
    expect(targetsFor(ready({ env: "development" }))).toEqual([]);
    expect(targetsFor(null)).toEqual(["production", "staging"]);
  });
});

describe("POST /cloudflare-stream", () => {
  it("forwards a staging event to staging only, unchanged and re-signed with the staging secret", async () => {
    const captured = stubTargets();
    const payload = ready({ publicId: "abcdefghijklmnop", env: "staging" });
    const res = await handle(await streamRequest(payload), routerEnv, NOW);
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe(routerEnv.STAGING_TARGET);
    expect(new TextDecoder().decode(captured[0]!.body)).toBe(JSON.stringify(payload));
    expect(
      await verifySignature(
        captured[0]!.body,
        captured[0]!.signature,
        routerEnv.STAGING_FORWARD_SECRET,
        NOW
      )
    ).toBe(true);
    // Neither the account secret nor the production secret signs a staging forward
    expect(
      await verifySignature(
        captured[0]!.body,
        captured[0]!.signature,
        routerEnv.STREAM_WEBHOOK_SECRET,
        NOW
      )
    ).toBe(false);
    expect(
      await verifySignature(
        captured[0]!.body,
        captured[0]!.signature,
        routerEnv.PRODUCTION_FORWARD_SECRET,
        NOW
      )
    ).toBe(false);
  });

  it("forwards a production event to production only", async () => {
    const captured = stubTargets();
    const res = await handle(await streamRequest(ready({ env: "production" })), routerEnv, NOW);
    expect(res.status).toBe(200);
    expect(captured.map(c => c.url)).toEqual([routerEnv.PRODUCTION_TARGET]);
    expect(
      await verifySignature(
        captured[0]!.body,
        captured[0]!.signature,
        routerEnv.PRODUCTION_FORWARD_SECRET,
        NOW
      )
    ).toBe(true);
  });

  it("sends an event with no env to both APIs", async () => {
    const captured = stubTargets();
    const res = await handle(await streamRequest(ready()), routerEnv, NOW);
    expect(res.status).toBe(200);
    expect(captured.map(c => c.url).sort()).toEqual(
      [routerEnv.PRODUCTION_TARGET, routerEnv.STAGING_TARGET].sort()
    );
  });

  it("drops an unknown env without forwarding", async () => {
    const captured = stubTargets();
    const res = await handle(await streamRequest(ready({ env: "development" })), routerEnv, NOW);
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(0);
  });

  it("refuses a bad signature, a stale signature and the wrong secret", async () => {
    const captured = stubTargets();
    const wrongSecret = await streamRequest(ready({ env: "staging" }), {
      secret: "not-the-secret",
    });
    expect((await handle(wrongSecret, routerEnv, NOW)).status).toBe(401);
    const stale = await streamRequest(ready({ env: "staging" }), { time: NOW - 301 });
    expect((await handle(stale, routerEnv, NOW)).status).toBe(401);
    const unsigned = new Request("https://stream-hooks.test/cloudflare-stream", {
      method: "POST",
      body: JSON.stringify(ready({ env: "staging" })),
    });
    expect((await handle(unsigned, routerEnv, NOW)).status).toBe(401);
    expect(captured).toHaveLength(0);
  });

  it("answers 502 when a target fails so Stream retries", async () => {
    stubTargets(500);
    expect(
      (await handle(await streamRequest(ready({ env: "production" })), routerEnv, NOW)).status
    ).toBe(502);
    vi.restoreAllMocks();
    stubTargets(() => new Error("network"));
    expect(
      (await handle(await streamRequest(ready({ env: "staging" })), routerEnv, NOW)).status
    ).toBe(502);
    vi.restoreAllMocks();
    // Fan out: production fine, staging down, so Stream retries
    stubTargets(url => (url === routerEnv.STAGING_TARGET ? 503 : 200));
    expect((await handle(await streamRequest(ready()), routerEnv, NOW)).status).toBe(502);
  });

  it("treats a 404 from an unconfigured API as delivered", async () => {
    stubTargets(404);
    expect(
      (await handle(await streamRequest(ready({ env: "staging" })), routerEnv, NOW)).status
    ).toBe(200);
  });

  it("skips a target with no URL or secret instead of making Stream retry the other one", async () => {
    const captured = stubTargets();
    const partial: RouterEnv = { ...routerEnv, STAGING_FORWARD_SECRET: "" };
    expect((await handle(await streamRequest(ready()), partial, NOW)).status).toBe(200);
    expect(captured.map(item => item.url)).toEqual([routerEnv.PRODUCTION_TARGET]);
    const noUrl: RouterEnv = { ...routerEnv, PRODUCTION_TARGET: "" };
    expect(
      (await handle(await streamRequest(ready({ env: "production" })), noUrl, NOW)).status
    ).toBe(200);
    expect(captured).toHaveLength(1);
  });

  it("accepts a signed body that is not JSON without forwarding", async () => {
    const captured = stubTargets();
    const res = await handle(await streamRequest(null, { raw: "not json" }), routerEnv, NOW);
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(0);
  });

  it("answers 404 on other paths and methods and 413 on a large body", async () => {
    const captured = stubTargets();
    expect(
      (await handle(await streamRequest(ready(), { path: "/other" }), routerEnv, NOW)).status
    ).toBe(404);
    const get = new Request("https://stream-hooks.test/cloudflare-stream");
    expect((await handle(get, routerEnv, NOW)).status).toBe(404);
    const big = await streamRequest(null, { raw: "x".repeat(MAX_BODY_BYTES + 1) });
    expect((await handle(big, routerEnv, NOW)).status).toBe(413);
    expect(captured).toHaveLength(0);
  });
});
