/**
 * Content system (Build Board #20), spec 3.17: R2 only mode. With the Stream
 * settings unset, images, audio, documents and files keep uploading while video
 * is refused with a clear message before any bytes are reserved or rows written.
 * Cloudflare and the database are faked, like content-router.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const assets: Row[] = [];
  const same = (a: any, b: any) =>
    a instanceof Uint8Array && b instanceof Uint8Array
      ? Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
      : a === b;
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("not" in value) return row[key] !== value.not;
      }
      return same(row[key] ?? null, value);
    });
  const prisma: any = {
    contentItem: {
      create: vi.fn(async ({ data }: any) => {
        const row = {
          status: "UPLOADING",
          publishState: "DRAFT",
          moderationState: "PENDING",
          processingStep: null,
          failureReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        items.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = items.find(item => matches(item, where));
        return row ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = items.filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      }),
      delete: vi.fn(async ({ where }: any) => {
        items.splice(
          items.findIndex(row => matches(row, where)),
          1
        );
      }),
      groupBy: vi.fn(async () => [{ kind: "AUDIO", _sum: { totalBytes: 2048n } }]),
    },
    contentAsset: {
      create: vi.fn(async ({ data }: any) => {
        const row = { createdAt: new Date(), ...data };
        assets.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: any) =>
          assets.find(
            row => same(row.contentItemId, where.contentItemId) && where.role.in.includes(row.role)
          ) ?? null
      ),
    },
    uploadedFile: { aggregate: vi.fn(async () => ({ _sum: { size: 1000n } })) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, items, assets };
});

const cf = vi.hoisted(() => ({
  presignR2Put: vi.fn(async () => "https://acct.r2.cloudflarestorage.com/put"),
  createStreamDirectUpload: vi.fn(async () => ({
    uploadUrl: "https://upload.videodelivery.net/tus/abc",
    uid: "a".repeat(32),
  })),
  updateStreamVideo: vi.fn(async () => ({})),
  deleteStreamVideo: vi.fn(async () => {}),
}));

const queue = vi.hoisted(() => ({
  publishContentJob: vi.fn(async (_message: unknown) => {}),
}));

const quota = vi.hoisted(() => ({
  ensureQuota: vi.fn(async () => ({
    bytesLimit: 5_368_709_120n,
    bytesUsed: 0n,
    bytesReserved: 0n,
    videoMinutesLimit: 300,
    videoMinutesUsed: 0,
  })),
  reserveBytes: vi.fn(async () => true),
}));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => 1) }));
vi.mock("../services/cloudflare/r2", () => cf);
vi.mock("../services/cloudflare/stream", () => cf);
vi.mock("../services/cloudflare/queue", () => queue);
vi.mock("../services/content/quota", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/quota")>()),
  ...quota,
}));
vi.mock("../services/uploadVerification", () => ({
  UPLOAD_VERIFICATION_MESSAGES: {
    missing: "File not found in storage. Please upload the file first.",
    size_mismatch:
      "The uploaded file does not match the file you selected. Please upload it again.",
    type_mismatch:
      "This file's contents do not match a supported file type. Please choose another file.",
  },
}));

import { env } from "../env";
import { contentRouter } from "../trpc/content";
import {
  contentConfigStatus,
  contentUploadsOpen,
  contentVideoUploadsOpen,
  streamConfigStatus,
} from "../services/cloudflare/config";

const MB = 1024 * 1024;
const owner = contentRouter.createCaller({ user: { sub: 7 } } as never);

const STREAM_SETTINGS = {
  CF_STREAM_API_TOKEN: "token",
  CF_STREAM_KEY_ID: "stream-key",
  CF_STREAM_KEY_PEM: "pem",
  CF_STREAM_CUSTOMER_CODE: "customer",
  CF_STREAM_WEBHOOK_SECRET: "webhook-secret",
};

const videoClosed =
  "Video uploads are not open yet. Upload images, audio, documents or files for now.";

beforeEach(() => {
  db.items.length = 0;
  db.assets.length = 0;
  Object.values(cf).forEach(fn => fn.mockClear());
  Object.values(quota).forEach(fn => fn.mockClear());
  queue.publishContentJob.mockClear();
  quota.reserveBytes.mockResolvedValue(true);
  Object.assign(env, {
    CONTENT_UPLOADS_ENABLED: true,
    CF_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "amped-content-test",
    CF_QUEUES_API_TOKEN: "queues",
    CF_CONTENT_QUEUE_ID: "queue-id",
    // R2 only: Stream is unset
    ...Object.fromEntries(Object.keys(STREAM_SETTINGS).map(name => [name, ""])),
  });
});

describe("content config in R2 only mode", () => {
  it("is ready for uploads without the Stream settings", () => {
    expect(contentConfigStatus()).toEqual({ ready: true, missing: [] });
    expect(contentUploadsOpen()).toBe(true);
  });

  it("lists exactly the missing Stream settings and closes video", () => {
    expect(streamConfigStatus()).toEqual({
      ready: false,
      missing: [
        "CF_STREAM_API_TOKEN",
        "CF_STREAM_KEY_ID",
        "CF_STREAM_KEY_PEM",
        "CF_STREAM_CUSTOMER_CODE",
        "CF_STREAM_WEBHOOK_SECRET",
      ],
    });
    expect(contentVideoUploadsOpen()).toBe(false);
  });

  it("opens video once every Stream setting and the flag are present", () => {
    Object.assign(env, STREAM_SETTINGS);
    expect(streamConfigStatus()).toEqual({ ready: true, missing: [] });
    expect(contentVideoUploadsOpen()).toBe(true);

    Object.assign(env, { CF_STREAM_KEY_PEM: "" });
    expect(contentVideoUploadsOpen()).toBe(false);

    Object.assign(env, { ...STREAM_SETTINGS, CONTENT_UPLOADS_ENABLED: false });
    expect(contentVideoUploadsOpen()).toBe(false);
  });
});

describe("createUpload in R2 only mode", () => {
  it("still uploads an image", async () => {
    const result = await owner.createUpload({
      kind: "image",
      fileName: "cover.png",
      mimeType: "image/png",
      size: 1024,
    });
    expect(result.target).toMatchObject({ type: "put" });
    expect(quota.reserveBytes).toHaveBeenCalledWith(7, 1024n);
    expect(db.items[0]).toMatchObject({ kind: "IMAGE" });
  });

  it("refuses a video before reserving bytes or writing rows", async () => {
    await expect(
      owner.createUpload({
        kind: "video",
        fileName: "Point Reyes.mov",
        mimeType: "video/quicktime",
        size: 10 * MB,
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: videoClosed });
    expect(quota.reserveBytes).not.toHaveBeenCalled();
    expect(db.items).toHaveLength(0);
    expect(db.assets).toHaveLength(0);
    expect(cf.createStreamDirectUpload).not.toHaveBeenCalled();
  });
});

describe("retryProcessing in R2 only mode", () => {
  it("refuses a video file before reserving bytes or writing rows", async () => {
    db.items.push({
      id: Buffer.alloc(16),
      publicId: "abcdefghijklmnop",
      userId: 7,
      kind: "VIDEO",
      title: "Point Reyes",
      status: "FAILED",
      processingStep: null,
      failureReason: "stream:unknown",
      totalBytes: BigInt(10 * MB),
    });
    await expect(
      owner.retryProcessing({
        publicId: "abcdefghijklmnop",
        file: { fileName: "Point Reyes.mov", mimeType: "video/quicktime", size: 10 * MB },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: videoClosed });
    expect(quota.reserveBytes).not.toHaveBeenCalled();
    expect(db.items[0]).toMatchObject({ status: "FAILED", processingStep: null });
    expect(db.assets).toHaveLength(0);
    expect(cf.createStreamDirectUpload).not.toHaveBeenCalled();
  });
});

describe("getStorage in R2 only mode", () => {
  it("reports uploads open and video closed", async () => {
    expect(await owner.getStorage()).toMatchObject({
      uploadsOpen: true,
      videoUploadsOpen: false,
    });
  });

  it("reports video open once Stream is configured", async () => {
    Object.assign(env, STREAM_SETTINGS);
    expect(await owner.getStorage()).toMatchObject({
      uploadsOpen: true,
      videoUploadsOpen: true,
    });
  });
});
