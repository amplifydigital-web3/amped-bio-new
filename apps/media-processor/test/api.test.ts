/**
 * The signed API client. The signature must match what the API verifies
 * (apps/server/src/services/cloudflare/mediaToken.ts, verifyProcessorCallback):
 * HMAC SHA-256 over `${t}.${rawBody}`, header `t={t},v1={hex}`.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { createApi, signBody, ApiError } from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
});

function respond(status: number, body?: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

describe("signature", () => {
  it("matches the API's HMAC over t.body", async () => {
    // Computed with node:crypto createHmac, the same call the API makes
    const raw = JSON.stringify({ publicId: "abcdefghijklmnop" });
    expect(await signBody(raw, "processor-secret", new Date(1_792_000_000_000))).toBe(
      "t=1792000000,v1=54afc33f52b6307b51d781f5406fab01939b14fc6bf01ea76eb5a44608bc905b"
    );
  });
});

describe("createApi", () => {
  const api = createApi("https://api.test", "processor-secret");

  it("posts a signed job request and returns the job", async () => {
    const fetchSpy = respond(200, { publicId: "abcdefghijklmnop", kind: "audio" });
    expect(await api.job("abcdefghijklmnop")).toMatchObject({ kind: "audio" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://api.test/internal/content/job");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-amped-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect((init as RequestInit).body).toBe('{"publicId":"abcdefghijklmnop"}');
  });

  it("returns null only for the API's own not_found answer", async () => {
    respond(404, { error: "not_found" });
    expect(await api.job("abcdefghijklmnop")).toBeNull();
    vi.restoreAllMocks();
    // A bare 404 means the route is closed: retry instead of dropping the item
    respond(404);
    await expect(api.job("abcdefghijklmnop")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns the callback result and throws on a server error", async () => {
    respond(200, { result: "blocked" });
    expect(await api.report({ publicId: "abcdefghijklmnop", step: "hash", outcome: "ok" })).toBe(
      "blocked"
    );
    vi.restoreAllMocks();
    respond(404, { result: "not_found" });
    expect(await api.report({ publicId: "abcdefghijklmnop", step: "done", outcome: "ok" })).toBe(
      "not_found"
    );
    vi.restoreAllMocks();
    respond(500);
    await expect(
      api.report({ publicId: "abcdefghijklmnop", step: "done", outcome: "ok" })
    ).rejects.toMatchObject({ status: 500 });
  });
});
