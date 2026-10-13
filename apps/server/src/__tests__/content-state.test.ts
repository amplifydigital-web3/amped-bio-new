/**
 * Content system PR 2 (Build Board #20): item state transitions driven by the
 * processor callback and the Stream webhook, the stale upload sweep, and the quota
 * SQL. Transitions are conditional on the current status so retries never commit
 * or release bytes twice. Handoff: docs/fixes/content-foundation.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const assets: Row[] = [];
  const hashes: Row[] = [];
  const same = (a: any, b: any) =>
    a instanceof Uint8Array && b instanceof Uint8Array
      ? Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
      : a === b;
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("lt" in value) return row[key] < value.lt;
        if ("not" in value) return row[key] !== value.not;
      }
      return same(row[key] ?? null, value);
    });
  const prisma: any = {
    contentItem: {
      findUnique: vi.fn(async ({ where }: any) => items.find(row => matches(row, where)) ?? null),
      findMany: vi.fn(async ({ where }: any) => items.filter(row => matches(row, where))),
      update: vi.fn(async ({ where, data }: any) => {
        const row = items.find(item => matches(item, where))!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = items.filter(item => matches(item, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    contentAsset: {
      findFirst: vi.fn(async ({ where, include }: any) => {
        const row = assets.find(asset => matches(asset, where));
        if (!row) return null;
        return include?.contentItem
          ? { ...row, contentItem: items.find(item => same(item.id, row.contentItemId)) }
          : row;
      }),
      update: vi.fn(async ({ where, data }: any) =>
        Object.assign(assets.find(a => same(a.id, where.id))!, data)
      ),
      create: vi.fn(async ({ data }: any) => {
        assets.push({ ...data });
        return data;
      }),
    },
    blockedContentHash: {
      upsert: vi.fn(async ({ create }: any) => {
        if (!hashes.some(hash => hash.sha256 === create.sha256)) hashes.push(create);
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, items, assets, hashes };
});

const quota = vi.hoisted(() => ({
  releaseBytes: vi.fn(async () => {}),
  commitBytes: vi.fn(async () => {}),
}));

vi.mock("@repo/database", () => ({ prisma: db.prisma }));
vi.mock("../services/content/quota", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/quota")>()),
  releaseBytes: quota.releaseBytes,
  commitBytes: quota.commitBytes,
}));

import {
  applyProcessorCallback,
  applyStreamWebhook,
  sweepStaleUploads,
  UPLOADING_TIMEOUT_MS,
} from "../services/content/state";
import { minutesForDuration } from "../services/content/quota";

const ITEM_ID = Uint8Array.from(Array.from({ length: 16 }, (_, i) => i + 1));

function seed(overrides: Record<string, unknown> = {}) {
  db.items.length = 0;
  db.assets.length = 0;
  db.hashes.length = 0;
  const item = {
    id: ITEM_ID,
    publicId: "abcdefghijklmnop",
    userId: 7,
    kind: "AUDIO",
    status: "PROCESSING",
    moderationState: "PENDING",
    totalBytes: 2048n,
    durationMs: null,
    createdAt: new Date(),
    ...overrides,
  };
  db.items.push(item);
  return item;
}

beforeEach(() => {
  quota.releaseBytes.mockClear();
  quota.commitBytes.mockClear();
});

describe("processor callback", () => {
  const base = { publicId: "abcdefghijklmnop" } as const;

  it("records each step and goes READY on done, committing bytes once", async () => {
    const item = seed();
    expect(
      await applyProcessorCallback({ ...base, step: "hash", outcome: "ok", sha256: "a".repeat(64) })
    ).toBe("applied");
    expect(item.processingStep).toBe("hash");
    expect(await applyProcessorCallback({ ...base, step: "done", outcome: "ok" })).toBe("applied");
    expect(item).toMatchObject({ status: "READY", processingStep: null, moderationState: "CLEAR" });
    expect(quota.commitBytes).toHaveBeenCalledTimes(1);
    expect(quota.commitBytes).toHaveBeenCalledWith(7, 2048n, 0, db.prisma);
    // The processor retries the last step: nothing changes
    expect(await applyProcessorCallback({ ...base, step: "done", outcome: "ok" })).toBe("ignored");
    expect(quota.commitBytes).toHaveBeenCalledTimes(1);
  });

  it("charges video minutes rounded up at READY", async () => {
    seed({ kind: "VIDEO", durationMs: 61_000 });
    await applyProcessorCallback({ ...base, step: "done", outcome: "ok" });
    expect(quota.commitBytes).toHaveBeenCalledWith(7, 2048n, 2, db.prisma);
    expect(minutesForDuration(0)).toBe(0);
    expect(minutesForDuration(60_000)).toBe(1);
  });

  it("keeps a held item held at READY", async () => {
    const item = seed();
    await applyProcessorCallback({
      ...base,
      step: "classifier",
      outcome: "held",
      reason: "explicit, not labeled 18+",
    });
    expect(item.moderationState).toBe("HELD");
    await applyProcessorCallback({ ...base, step: "done", outcome: "ok" });
    expect(item).toMatchObject({ status: "READY", moderationState: "HELD" });
  });

  it("fails an item and releases its bytes", async () => {
    const item = seed();
    await applyProcessorCallback({
      ...base,
      step: "normalize",
      outcome: "failed",
      reason: "ffmpeg exit 1",
    });
    expect(item).toMatchObject({ status: "FAILED", failureReason: "ffmpeg exit 1" });
    expect(quota.releaseBytes).toHaveBeenCalledWith(7, 2048n, db.prisma);
  });

  it("blocks malware, releases bytes and adds the hash to the blocklist", async () => {
    const item = seed();
    const sha256 = "b".repeat(64);
    await applyProcessorCallback({
      ...base,
      step: "malware",
      outcome: "blocked",
      reason: "Eicar-Signature",
      sha256,
    });
    expect(item).toMatchObject({
      status: "BLOCKED",
      moderationState: "BLOCKED",
      moderationReason: "Eicar-Signature",
    });
    expect(db.hashes.map(hash => hash.sha256)).toEqual([sha256]);
    expect(quota.releaseBytes).toHaveBeenCalledTimes(1);
  });

  it("never stores a CSAM match hash in the blocklist table", async () => {
    seed();
    await applyProcessorCallback({
      ...base,
      step: "csam",
      outcome: "blocked",
      sha256: "c".repeat(64),
    });
    expect(db.hashes).toHaveLength(0);
  });

  it("upserts assets by role, variant and language", async () => {
    seed();
    const asset = {
      role: "RENDITION",
      storage: "R2",
      r2Key: "derived/abc/RENDITION/640",
      variant: "640",
      scanStatus: "SKIPPED",
    } as const;
    await applyProcessorCallback({ ...base, step: "normalize", outcome: "ok", assets: [asset] });
    await applyProcessorCallback({
      ...base,
      step: "normalize",
      outcome: "ok",
      assets: [{ ...asset, size: 900 }],
    });
    expect(db.assets).toHaveLength(1);
    expect(db.assets[0]).toMatchObject({ role: "RENDITION", variant: "640", size: 900n });
  });

  it("answers not_found for an unknown item and ignores a deleted one", async () => {
    seed({ status: "DELETED" });
    expect(
      await applyProcessorCallback({ publicId: "zzzzzzzzzzzzzzzz", step: "done", outcome: "ok" })
    ).toBe("not_found");
    expect(await applyProcessorCallback({ ...base, step: "done", outcome: "ok" })).toBe("ignored");
  });
});

describe("Stream webhook", () => {
  const uid = "6b9e68b07dfee8cc2d116e4c51d6a957";

  function seedVideo(status = "PROCESSING") {
    const item = seed({ kind: "VIDEO", status });
    db.assets.push({
      id: Uint8Array.from([9]),
      contentItemId: ITEM_ID,
      role: "STREAM",
      streamUid: uid,
    });
    return item;
  }

  it("marks a ready video stream_ready with its duration", async () => {
    const item = seedVideo();
    expect(
      await applyStreamWebhook({
        uid,
        readyToStream: true,
        duration: 95.4,
        status: { state: "ready" },
      })
    ).toBe("ready");
    expect(item).toMatchObject({
      status: "PROCESSING",
      processingStep: "stream_ready",
      durationMs: 95_400,
    });
    expect(db.assets[0]!.durationMs).toBe(95_400);
  });

  it("fails a video Stream could not encode and releases its bytes once", async () => {
    const item = seedVideo();
    const body = {
      uid,
      readyToStream: false,
      status: { state: "error", errReasonCode: "ERR_MALFORMED_VIDEO" },
    };
    expect(await applyStreamWebhook(body)).toBe("failed");
    await applyStreamWebhook(body);
    expect(item).toMatchObject({ status: "FAILED", failureReason: "stream:ERR_MALFORMED_VIDEO" });
    expect(quota.releaseBytes).toHaveBeenCalledTimes(1);
  });

  it("ignores videos that are not ours and events without a uid", async () => {
    seedVideo();
    expect(
      await applyStreamWebhook({
        uid: "f".repeat(32),
        readyToStream: true,
        status: { state: "ready" },
      })
    ).toBe("ignored");
    expect(await applyStreamWebhook({})).toBe("ignored");
  });
});

describe("stale upload sweep", () => {
  it("fails uploads older than 24 hours and releases their bytes", async () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const item = seed({
      status: "UPLOADING",
      createdAt: new Date(now.getTime() - UPLOADING_TIMEOUT_MS - 1),
    });
    expect(await sweepStaleUploads(now)).toBe(1);
    expect(item).toMatchObject({ status: "FAILED", failureReason: "upload_expired" });
    expect(quota.releaseBytes).toHaveBeenCalledTimes(1);
  });
});
