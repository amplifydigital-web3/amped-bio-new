/**
 * The queue handler: acknowledges finished messages, retries transient errors with
 * backoff, drops malformed messages, and fails items from the dead letter queue.
 */
import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import type { ContentJob } from "@repo/constants/src/contentJob";
import { createClassifier, createCsamMatcher } from "../src/adapters";
import type { Api, ProcessedCallback } from "../src/api";
import { createQueueHandler, retryDelaySeconds } from "../src/index";
import type { Deps } from "../src/pipeline";

const ID = "queuequeuequeue1";

function deps(job: ContentJob | null, reports: ProcessedCallback[], fail = false): Deps {
  const api: Api = {
    job: async () => {
      if (fail) throw new Error("api 503");
      return job;
    },
    report: async callback => {
      reports.push(callback);
      return "applied";
    },
  };
  return {
    bucket: env.CONTENT,
    api,
    toolbox: { call: async () => ({ ok: false, reason: "unused" }) },
    csam: createCsamMatcher("none"),
    classifier: createClassifier("mock"),
    classifierRequired: false,
    secret: "processor-test-secret",
    fetchImage: async () => new Response(null, { status: 404 }),
  };
}

async function runBatch(queue: string, bodies: unknown[], made: Deps, attempts = 1) {
  const batch = createMessageBatch(
    queue,
    bodies.map((body, i) => ({ id: `m${i}`, timestamp: new Date(), attempts, body }))
  );
  const retries = batch.messages.map(message => vi.spyOn(message, "retry"));
  const ctx = createExecutionContext();
  await createQueueHandler(() => made)(batch, env);
  return { ...(await getQueueResult(batch, ctx)), retries };
}

describe("queue handler", () => {
  it("acknowledges a finished message and a malformed one", async () => {
    const reports: ProcessedCallback[] = [];
    const result = await runBatch(
      "content-ingest-local",
      [{ type: "r2", publicId: ID }, { type: "r2", publicId: "../../etc/passwd" }, "junk"],
      deps(null, reports)
    );
    expect(result.explicitAcks.sort()).toEqual(["m0", "m1", "m2"]);
    expect(result.retryMessages).toEqual([]);
  });

  it("retries a transient error with backoff", async () => {
    const result = await runBatch(
      "content-ingest-local",
      [{ type: "r2", publicId: ID }],
      deps(null, [], true),
      2
    );
    expect(result.explicitAcks).toEqual([]);
    expect(result.retryMessages).toEqual([expect.objectContaining({ msgId: "m0" })]);
    expect(result.retries[0]).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect([1, 2, 3, 4, 9].map(retryDelaySeconds)).toEqual([60, 120, 240, 480, 600]);
  });

  it("fails the item for a dead letter", async () => {
    const reports: ProcessedCallback[] = [];
    const result = await runBatch(
      "content-ingest-local-dlq",
      [{ type: "video", publicId: ID }],
      deps(null, reports)
    );
    expect(result.explicitAcks).toEqual(["m0"]);
    expect(reports).toEqual([
      { publicId: ID, step: "done", outcome: "failed", reason: "processing_error" },
    ]);
  });
});
