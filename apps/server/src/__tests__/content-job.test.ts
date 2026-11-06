/**
 * Content system PR 4 (Build Board #20): the job the processor Worker asks for.
 * No user data. Video jobs carry signed Stream thumbnail URLs so the processor
 * never holds the Stream signing key. Handoff: docs/fixes/content-media-processor.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  item: null as Record<string, any> | null,
  asset: null as Record<string, any> | null,
}));
const stream = vi.hoisted(() => ({
  getStreamVideo: vi.fn(
    async (): Promise<any> => ({
      thumbnail: "https://customer-abc123.cloudflarestream.com/uid/thumbnails/thumbnail.jpg",
    })
  ),
  signStreamToken: vi.fn(() => "signed-token"),
}));

vi.mock("@repo/database", () => ({
  prisma: {
    contentItem: { findUnique: vi.fn(async () => db.item) },
    contentAsset: { findFirst: vi.fn(async () => db.asset) },
  },
}));
vi.mock("../services/cloudflare/stream", () => stream);

import { env } from "../env";
import { buildProcessorJob, streamCustomerHost, streamThumbnailUrl } from "../services/content/job";

const publicId = "abcdefghijklmnop";

beforeEach(() => {
  stream.getStreamVideo.mockClear();
  stream.signStreamToken.mockClear();
  Object.assign(env, { CF_STREAM_CUSTOMER_CODE: "" });
  db.item = {
    id: new Uint8Array(16),
    publicId,
    userId: 7,
    kind: "AUDIO",
    status: "PROCESSING",
    title: "Low Tide",
    adult: false,
    allowDownload: true,
    previewConfig: { seconds: 30 },
    durationMs: null,
  };
  db.asset = {
    role: "ORIGINAL",
    storage: "R2",
    r2Key: `incoming/${publicId}/original.mp3`,
    mimeType: "audio/mpeg",
    streamUid: null,
  };
});

describe("buildProcessorJob", () => {
  it("returns null for an unknown item", async () => {
    db.item = null;
    expect(await buildProcessorJob(publicId)).toBeNull();
  });

  it("describes an R2 upload without user data", async () => {
    const job = await buildProcessorJob(publicId);
    expect(job).toEqual({
      publicId,
      kind: "audio",
      status: "processing",
      title: "Low Tide",
      adult: false,
      allowDownload: true,
      previewSeconds: 30,
      incomingKey: `incoming/${publicId}/original.mp3`,
      mimeType: "audio/mpeg",
      ext: "mp3",
      video: null,
    });
    expect(JSON.stringify(job)).not.toContain('"userId"');
  });

  it("adds signed poster and keyframe URLs for a video in processing", async () => {
    db.item = { ...db.item!, kind: "VIDEO", durationMs: 12_000, previewConfig: null };
    db.asset = {
      role: "STREAM",
      storage: "STREAM",
      r2Key: null,
      mimeType: "video/mp4",
      streamUid: "u".repeat(32),
    };
    const job = await buildProcessorJob(publicId);
    expect(job?.incomingKey).toBeNull();
    expect(stream.signStreamToken).toHaveBeenCalledWith({
      uid: "u".repeat(32),
      expiresInSeconds: 7200,
    });
    expect(job?.video?.posterUrl).toBe(
      "https://customer-abc123.cloudflarestream.com/signed-token/thumbnails/thumbnail.jpg?time=5s&width=1280&height=1280&fit=clip"
    );
    expect(job?.video?.keyframeUrls).toHaveLength(3);
    expect(job?.video?.keyframeUrls[2]).toContain("time=10s&width=640");
  });

  it("skips thumbnails for a video that is not processing", async () => {
    db.item = { ...db.item!, kind: "VIDEO", status: "READY" };
    db.asset = { role: "STREAM", storage: "STREAM", r2Key: null, streamUid: "u".repeat(32) };
    expect((await buildProcessorJob(publicId))?.video).toBeNull();
    expect(stream.signStreamToken).not.toHaveBeenCalled();
  });
});

describe("streamCustomerHost", () => {
  it("prefers CF_STREAM_CUSTOMER_CODE", async () => {
    Object.assign(env, { CF_STREAM_CUSTOMER_CODE: "xyz789" });
    expect(await streamCustomerHost("u")).toBe("customer-xyz789.cloudflarestream.com");
    expect(stream.getStreamVideo).not.toHaveBeenCalled();
  });

  it("reads the host from the video, and refuses anything else", async () => {
    expect(await streamCustomerHost("u")).toBe("customer-abc123.cloudflarestream.com");
    stream.getStreamVideo.mockResolvedValueOnce({ thumbnail: "https://evil.example/x.jpg" });
    await expect(streamCustomerHost("u")).rejects.toThrow("CF_STREAM_CUSTOMER_CODE");
  });

  it("builds the thumbnail URL with the token in place of the uid", () => {
    expect(streamThumbnailUrl("h", "t", 0, 640)).toBe(
      "https://h/t/thumbnails/thumbnail.jpg?time=0s&width=640&height=640&fit=clip"
    );
  });
});
