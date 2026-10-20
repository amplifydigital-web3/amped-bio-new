/**
 * Content system PR 2 (Build Board #20): POST /webhooks/cloudflare-stream and
 * POST /internal/content/processed. Both are closed (404) until their secret is
 * set, refuse a bad signature (401), and only then touch item state.
 * Handoff: docs/fixes/content-foundation.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const state = vi.hoisted(() => ({
  applyStreamWebhook: vi.fn(async (): Promise<string> => "ready"),
  applyProcessorCallback: vi.fn(async (): Promise<string> => "applied"),
}));
const job = vi.hoisted(() => ({
  buildProcessorJob: vi.fn(
    async (publicId: string): Promise<unknown> => ({ publicId, kind: "audio" })
  ),
}));
vi.mock("../services/content/state", () => state);
vi.mock("../services/content/job", () => job);
vi.mock("@repo/database", () => ({ prisma: {} }));

import { env } from "../env";
import {
  handleProcessorCallback,
  handleProcessorJob,
  handleStreamWebhook,
} from "../routes/content";
import { signProcessorCallback } from "../services/cloudflare/mediaToken";

function call(handler: typeof handleStreamWebhook, body: string, headers: Record<string, string>) {
  const res = {
    statusCode: 0,
    json: undefined as unknown,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  } as any;
  res.json = vi.fn((value: unknown) => {
    res.body = value;
    res.headersSent = true;
    return res;
  });
  const req = { body: Buffer.from(body), headers } as any;
  return handler(req, res).then(() => res);
}

beforeEach(() => {
  state.applyStreamWebhook.mockClear();
  state.applyProcessorCallback.mockClear();
  job.buildProcessorJob.mockClear();
  Object.assign(env, {
    CF_STREAM_WEBHOOK_SECRET: "stream-secret",
    CONTENT_PROCESSOR_SECRET: "processor-secret",
  });
});

describe("POST /webhooks/cloudflare-stream", () => {
  const body = JSON.stringify({
    uid: "a".repeat(32),
    readyToStream: true,
    status: { state: "ready" },
  });
  const sign = (raw: string, secret = "stream-secret") => {
    const time = Math.floor(Date.now() / 1000);
    return `time=${time},sig1=${createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex")}`;
  };

  it("answers 404 until the webhook secret is set", async () => {
    Object.assign(env, { CF_STREAM_WEBHOOK_SECRET: "" });
    const res = await call(handleStreamWebhook, body, { "webhook-signature": sign(body) });
    expect(res.statusCode).toBe(404);
    expect(state.applyStreamWebhook).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong signature with 401", async () => {
    expect((await call(handleStreamWebhook, body, {})).statusCode).toBe(401);
    expect(
      (await call(handleStreamWebhook, body, { "webhook-signature": sign(body, "other") }))
        .statusCode
    ).toBe(401);
    expect(state.applyStreamWebhook).not.toHaveBeenCalled();
  });

  it("applies a signed event", async () => {
    const res = await call(handleStreamWebhook, body, { "webhook-signature": sign(body) });
    expect(res.statusCode).toBe(200);
    expect(state.applyStreamWebhook).toHaveBeenCalledWith(JSON.parse(body));
  });

  it("acknowledges a signed body that is not JSON without retrying", async () => {
    const res = await call(handleStreamWebhook, "not json", {
      "webhook-signature": sign("not json"),
    });
    expect(res.statusCode).toBe(200);
    expect(state.applyStreamWebhook).not.toHaveBeenCalled();
  });
});

describe("POST /internal/content/processed", () => {
  const callback = { publicId: "abcdefghijklmnop", step: "done", outcome: "ok" };
  const body = JSON.stringify(callback);
  const headers = (raw: string, secret = "processor-secret") => ({
    "x-amped-signature": signProcessorCallback(raw, secret),
  });

  it("answers 404 until the processor secret is set", async () => {
    Object.assign(env, { CONTENT_PROCESSOR_SECRET: "" });
    expect((await call(handleProcessorCallback, body, headers(body))).statusCode).toBe(404);
  });

  it("refuses a wrong signature with 401", async () => {
    expect((await call(handleProcessorCallback, body, headers(body, "other"))).statusCode).toBe(
      401
    );
    expect(state.applyProcessorCallback).not.toHaveBeenCalled();
  });

  it("refuses a signed body that does not match the callback schema with 400", async () => {
    const bad = JSON.stringify({ ...callback, outcome: "maybe" });
    expect((await call(handleProcessorCallback, bad, headers(bad))).statusCode).toBe(400);
    expect((await call(handleProcessorCallback, "{", headers("{"))).statusCode).toBe(400);
    expect(state.applyProcessorCallback).not.toHaveBeenCalled();
  });

  it("applies a signed callback and answers 404 for an unknown item", async () => {
    const res = await call(handleProcessorCallback, body, headers(body));
    expect(res.statusCode).toBe(200);
    expect(state.applyProcessorCallback).toHaveBeenCalledWith(callback);
    state.applyProcessorCallback.mockResolvedValueOnce("not_found");
    expect((await call(handleProcessorCallback, body, headers(body))).statusCode).toBe(404);
  });
});

describe("POST /internal/content/job", () => {
  const body = JSON.stringify({ publicId: "abcdefghijklmnop" });
  const headers = (raw: string, secret = "processor-secret") => ({
    "x-amped-signature": signProcessorCallback(raw, secret),
  });

  it("answers 404 until the processor secret is set", async () => {
    Object.assign(env, { CONTENT_PROCESSOR_SECRET: "" });
    expect((await call(handleProcessorJob, body, headers(body))).statusCode).toBe(404);
    expect(job.buildProcessorJob).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong signature with 401", async () => {
    expect((await call(handleProcessorJob, body, {})).statusCode).toBe(401);
    expect((await call(handleProcessorJob, body, headers(body, "other"))).statusCode).toBe(401);
    expect(job.buildProcessorJob).not.toHaveBeenCalled();
  });

  it("refuses bad JSON or a bad public id with 400", async () => {
    expect((await call(handleProcessorJob, "{", headers("{"))).statusCode).toBe(400);
    const bad = JSON.stringify({ publicId: "../../etc" });
    expect((await call(handleProcessorJob, bad, headers(bad))).statusCode).toBe(400);
    expect(job.buildProcessorJob).not.toHaveBeenCalled();
  });

  it("answers the job, or 404 for an unknown item", async () => {
    const res = await call(handleProcessorJob, body, headers(body));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ publicId: "abcdefghijklmnop", kind: "audio" });
    job.buildProcessorJob.mockResolvedValueOnce(null);
    const missing = await call(handleProcessorJob, body, headers(body));
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toEqual({ error: "not_found" });
  });
});
