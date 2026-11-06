/**
 * Content system PR 4 (Build Board #20): the API puts processing jobs on the
 * `content-ingest` Queue over the Queues HTTP API. A 5xx or a network error is
 * retried twice; a 4xx is a configuration fault and is not.
 * Handoff: docs/fixes/content-media-processor.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@repo/database", () => ({ prisma: {} }));

import { env } from "../env";
import {
  contentQueueConfigured,
  publishContentJob,
  QueuePublishError,
} from "../services/cloudflare/queue";

const fetchMock = vi.fn();
const noSleep = vi.fn(async () => {});
const message = { type: "r2" as const, publicId: "abcdefghijklmnop" };

beforeEach(() => {
  fetchMock.mockReset();
  noSleep.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(env, {
    CF_ACCOUNT_ID: "acct",
    CF_QUEUES_API_TOKEN: "queues-token",
    CF_CONTENT_QUEUE_ID: "queue-id",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishContentJob", () => {
  it("posts the message body to the queue with the token", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await publishContentJob(message, noSleep);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/queues/queue-id/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer queues-token");
    expect(JSON.parse(init.body)).toEqual({ body: message });
  });

  it("retries a 5xx and a network error, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await publishContentJob(message, noSleep);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await expect(publishContentJob(message, noSleep)).rejects.toBeInstanceOf(QueuePublishError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 4xx", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    await expect(publishContentJob(message, noSleep)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to publish when the queue is not configured", async () => {
    Object.assign(env, { CF_CONTENT_QUEUE_ID: "" });
    expect(contentQueueConfigured()).toBe(false);
    await expect(publishContentJob(message, noSleep)).rejects.toBeInstanceOf(QueuePublishError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
