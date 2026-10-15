/**
 * Content system PR 2 (Build Board #20): the content router. Cloudflare and the
 * database are faked; the tests check what the router decides: the flag, type and
 * size checks, quota reservation, which upload target comes back, the size and
 * type check at completeUpload, ownership, and what the owner can see.
 * Handoff: docs/fixes/content-foundation.md.
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
          accessRuleId: null,
          description: null,
          processingStep: null,
          failureReason: null,
          allowDownload: false,
          adult: false,
          previewConfig: null,
          chapters: null,
          durationMs: null,
          pageCount: null,
          width: null,
          height: null,
          publishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        items.push(row);
        return row;
      }),
      // Copies, like Prisma: a later update never changes an object already returned
      findUnique: vi.fn(async ({ where }: any) => {
        const row = items.find(item => matches(item, where));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where, take }: any) =>
        items
          .filter(row => matches(row, where))
          .slice(0, take)
          .map(row => ({ ...row }))
      ),
      update: vi.fn(async ({ where, data }: any) =>
        Object.assign(items.find(row => matches(row, where))!, data)
      ),
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
        const row = {
          scanStatus: "PENDING",
          variant: null,
          lang: null,
          width: null,
          height: null,
          durationMs: null,
          createdAt: new Date(),
          ...data,
        };
        assets.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: any) =>
          assets.find(
            row => same(row.contentItemId, where.contentItemId) && where.role.in.includes(row.role)
          ) ?? null
      ),
      findMany: vi.fn(async ({ where }: any) =>
        assets.filter(row => same(row.contentItemId, where.contentItemId))
      ),
    },
    uploadedFile: { aggregate: vi.fn(async () => ({ _sum: { size: 1000n } })) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, items, assets };
});

const cf = vi.hoisted(() => ({
  presignR2Put: vi.fn(async () => "https://acct.r2.cloudflarestorage.com/put"),
  createR2Multipart: vi.fn(async () => "upload-1"),
  presignR2Parts: vi.fn(async (_k: string, _u: string, _s: number, parts: number[]) =>
    parts.map(partNumber => ({ partNumber, url: `https://r2/part/${partNumber}` }))
  ),
  completeR2Multipart: vi.fn(async () => {}),
  abortR2Multipart: vi.fn(async () => {}),
  deleteR2Object: vi.fn(async () => {}),
  verifyR2Object: vi.fn(
    async (): Promise<any> => ({ ok: true, size: 2048, detectedType: "audio/mpeg" })
  ),
  createStreamDirectUpload: vi.fn(async () => ({
    uploadUrl: "https://upload.videodelivery.net/tus/abc",
    uid: "a".repeat(32),
  })),
  updateStreamVideo: vi.fn(async () => ({})),
  getStreamVideo: vi.fn(
    async (): Promise<any> => ({ status: { state: "inprogress" }, readyToStream: false })
  ),
  deleteStreamVideo: vi.fn(async () => {}),
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
  releaseBytes: vi.fn(async () => {}),
  commitBytes: vi.fn(async () => {}),
}));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => 1) }));
vi.mock("../services/cloudflare/r2", () => cf);
vi.mock("../services/cloudflare/stream", () => cf);
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

const MB = 1024 * 1024;
const owner = contentRouter.createCaller({ user: { sub: 7 } } as never);
const stranger = contentRouter.createCaller({ user: { sub: 8 } } as never);
const audio = {
  kind: "audio" as const,
  fileName: "Low Tide EP stems.mp3",
  mimeType: "audio/mpeg",
  size: 2048,
};

beforeEach(() => {
  db.items.length = 0;
  db.assets.length = 0;
  Object.values(cf).forEach(fn => fn.mockClear());
  Object.values(quota).forEach(fn => fn.mockClear());
  quota.reserveBytes.mockResolvedValue(true);
  Object.assign(env, {
    CONTENT_UPLOADS_ENABLED: true,
    CF_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "amped-content-test",
    CF_STREAM_API_TOKEN: "token",
  });
});

describe("createUpload", () => {
  it("is closed while the flag is off or Cloudflare is not configured", async () => {
    Object.assign(env, { CONTENT_UPLOADS_ENABLED: false });
    await expect(owner.createUpload(audio)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    Object.assign(env, { CONTENT_UPLOADS_ENABLED: true, R2_BUCKET: "" });
    await expect(owner.createUpload(audio)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(quota.reserveBytes).not.toHaveBeenCalled();
  });

  it("refuses a type outside the kind and a file over the kind's limit", async () => {
    await expect(owner.createUpload({ ...audio, fileName: "stems.exe" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      owner.createUpload({
        kind: "image",
        fileName: "logo.svg",
        mimeType: "image/svg+xml",
        size: 10,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(owner.createUpload({ ...audio, size: 501 * MB })).rejects.toMatchObject({
      message: "This file is larger than the 500 MB limit.",
    });
    expect(quota.reserveBytes).not.toHaveBeenCalled();
  });

  it("refuses when the quota cannot hold the file, and creates nothing", async () => {
    quota.reserveBytes.mockResolvedValueOnce(false);
    await expect(owner.createUpload(audio)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.items).toHaveLength(0);
  });

  it("returns one presigned PUT for a small file and reserves its bytes", async () => {
    const result = await owner.createUpload(audio);
    expect(result.publicId).toMatch(/^[a-z0-9]{16}$/);
    expect(result.target).toEqual({
      type: "put",
      url: "https://acct.r2.cloudflarestorage.com/put",
      headers: { "Content-Type": "audio/mpeg" },
    });
    expect(quota.reserveBytes).toHaveBeenCalledWith(7, 2048n);
    expect(db.items[0]).toMatchObject({
      title: "Low Tide EP stems",
      kind: "AUDIO",
      totalBytes: 2048n,
    });
    expect(db.assets[0]).toMatchObject({
      role: "ORIGINAL",
      storage: "R2",
      r2Key: `incoming/${result.publicId}/original.mp3`,
    });
  });

  it("returns a multipart upload for 100 MB and over", async () => {
    const result = await owner.createUpload({ ...audio, size: 205 * MB });
    expect(result.target).toEqual({
      type: "multipart",
      uploadId: "upload-1",
      partCount: 21,
      partBytes: 10 * MB,
    });
  });

  it("returns a Stream TUS URL for video, capped at the minutes left", async () => {
    quota.ensureQuota.mockResolvedValueOnce({
      bytesLimit: 5_368_709_120n,
      bytesUsed: 0n,
      bytesReserved: 0n,
      videoMinutesLimit: 300,
      videoMinutesUsed: 280,
    });
    const result = await owner.createUpload({
      kind: "video",
      fileName: "Point Reyes.mov",
      mimeType: "video/quicktime",
      size: 300 * MB,
    });
    expect(result.target).toMatchObject({
      type: "stream",
      uploadUrl: "https://upload.videodelivery.net/tus/abc",
    });
    expect(cf.createStreamDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({ size: 300 * MB, maxDurationSeconds: 20 * 60 })
    );
    expect(db.assets[0]).toMatchObject({
      role: "STREAM",
      storage: "STREAM",
      streamUid: "a".repeat(32),
    });
    expect(cf.updateStreamVideo).toHaveBeenCalledWith("a".repeat(32), {
      publicId: result.publicId,
      env: env.APP_ENV,
    });
  });

  it("refuses a video longer than the minutes left, or with no minutes left", async () => {
    quota.ensureQuota.mockResolvedValueOnce({
      videoMinutesLimit: 300,
      videoMinutesUsed: 290,
    } as any);
    await expect(
      owner.createUpload({
        kind: "video",
        fileName: "a.mp4",
        mimeType: "video/mp4",
        size: MB,
        durationSec: 11 * 60,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    quota.ensureQuota.mockResolvedValueOnce({
      videoMinutesLimit: 300,
      videoMinutesUsed: 300,
    } as any);
    await expect(
      owner.createUpload({ kind: "video", fileName: "a.mp4", mimeType: "video/mp4", size: MB })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("gives the bytes back and drops the item when storage refuses the upload", async () => {
    cf.presignR2Put.mockRejectedValueOnce(new Error("R2 down"));
    await expect(owner.createUpload(audio)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(quota.releaseBytes).toHaveBeenCalledWith(7, 2048n);
    expect(db.items).toHaveLength(0);
  });
});

describe("completeUpload", () => {
  it("moves a verified R2 upload to PROCESSING", async () => {
    const { publicId } = await owner.createUpload(audio);
    expect(await owner.completeUpload({ publicId })).toEqual({ publicId, status: "processing" });
    expect(cf.verifyR2Object).toHaveBeenCalledWith(
      `incoming/${publicId}/original.mp3`,
      2048n,
      "audio/mpeg",
      expect.arrayContaining(["audio/mpeg", "audio/wav"])
    );
    expect(db.items[0]).toMatchObject({ status: "PROCESSING", processingStep: "queued" });
  });

  it("deletes a file whose size or type does not match, fails the item and releases its bytes", async () => {
    const { publicId } = await owner.createUpload(audio);
    cf.verifyR2Object.mockResolvedValueOnce({
      ok: false,
      reason: "type_mismatch",
      detail: "unknown_type",
    });
    await expect(owner.completeUpload({ publicId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "This file's contents do not match a supported file type. Please choose another file.",
    });
    expect(cf.deleteR2Object).toHaveBeenCalledWith(`incoming/${publicId}/original.mp3`);
    expect(db.items[0]).toMatchObject({ status: "FAILED", failureReason: "type_mismatch" });
    expect(quota.releaseBytes).toHaveBeenCalledWith(7, 2048n, db.prisma);
  });

  it("lets the client retry when the bytes have not landed yet", async () => {
    const { publicId } = await owner.createUpload(audio);
    cf.verifyR2Object.mockResolvedValueOnce({ ok: false, reason: "missing", detail: "x" });
    await expect(owner.completeUpload({ publicId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.items[0]!.status).toBe("UPLOADING");
  });

  it("completes a multipart upload only with every part", async () => {
    const { publicId } = await owner.createUpload({ ...audio, size: 105 * MB });
    const parts = Array.from({ length: 11 }, (_, i) => ({
      partNumber: i + 1,
      etag: `"e${i + 1}"`,
    }));
    await expect(
      owner.completeUpload({ publicId, uploadId: "upload-1", parts: parts.slice(0, 10) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(owner.completeUpload({ publicId, parts })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await owner.completeUpload({ publicId, uploadId: "upload-1", parts });
    expect(cf.completeR2Multipart).toHaveBeenCalledWith(
      `incoming/${publicId}/original.mp3`,
      "upload-1",
      parts
    );
  });

  it("confirms a video with Stream and waits while the upload is pending", async () => {
    const { publicId } = await owner.createUpload({
      kind: "video",
      fileName: "a.mp4",
      mimeType: "video/mp4",
      size: MB,
    });
    cf.getStreamVideo.mockResolvedValueOnce({
      status: { state: "pendingupload" },
      readyToStream: false,
    });
    await expect(owner.completeUpload({ publicId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.completeUpload({ publicId });
    expect(db.items[0]).toMatchObject({ status: "PROCESSING", processingStep: "encoding" });
  });
});

describe("completeUpload is idempotent", () => {
  it("answers with the current state when the item already left UPLOADING", async () => {
    const { publicId } = await owner.createUpload({
      kind: "video",
      fileName: "a.mp4",
      mimeType: "video/mp4",
      size: MB,
    });
    // Stream's ready webhook arrived first
    Object.assign(db.items[0]!, { status: "PROCESSING", processingStep: "stream_ready" });
    expect(await owner.completeUpload({ publicId })).toEqual({ publicId, status: "processing" });
    expect(cf.getStreamVideo).not.toHaveBeenCalled();
    Object.assign(db.items[0]!, { status: "FAILED" });
    await expect(owner.completeUpload({ publicId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("ownership and the rest", () => {
  it("hides another creator's item as not found", async () => {
    const { publicId } = await owner.createUpload(audio);
    await expect(stranger.get({ publicId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stranger.completeUpload({ publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(stranger.update({ publicId, title: "Mine now" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("signs only the parts that exist", async () => {
    const { publicId } = await owner.createUpload({ ...audio, size: 205 * MB });
    const result = await owner.signParts({ publicId, uploadId: "upload-1", partNumbers: [1, 21] });
    expect(result.parts.map(part => part.partNumber)).toEqual([1, 21]);
    await expect(
      owner.signParts({ publicId, uploadId: "upload-1", partNumbers: [22] })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("aborts an upload, cleans storage and releases the bytes", async () => {
    const { publicId } = await owner.createUpload({ ...audio, size: 205 * MB });
    expect(await owner.abortUpload({ publicId, uploadId: "upload-1" })).toEqual({
      publicId,
      status: "deleted",
    });
    expect(cf.abortR2Multipart).toHaveBeenCalled();
    expect(quota.releaseBytes).toHaveBeenCalledWith(7, BigInt(205 * MB), db.prisma);
    expect(db.items[0]!.status).toBe("DELETED");
    await expect(owner.get({ publicId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows the owner the item without user id, storage keys or Stream uids", async () => {
    const { publicId } = await owner.createUpload({
      kind: "video",
      fileName: "a.mp4",
      mimeType: "video/mp4",
      size: MB,
    });
    const item = await owner.get({ publicId });
    const text = JSON.stringify(item, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(item).toMatchObject({ publicId, kind: "video", status: "uploading", gated: false });
    expect(text).not.toContain("userId");
    expect(text).not.toContain("a".repeat(32));
    expect(text).not.toContain("incoming/");
  });

  it("accepts a preview only where it fits the kind", async () => {
    const { publicId } = await owner.createUpload(audio);
    await expect(owner.update({ publicId, previewConfig: { pages: 2 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const updated = await owner.update({
      publicId,
      title: "Low Tide EP, stems",
      previewConfig: { seconds: 30 },
    });
    expect(updated).toMatchObject({ title: "Low Tide EP, stems", previewConfig: { seconds: 30 } });
  });

  it("reports storage with limits per kind and the page files", async () => {
    const storage = await owner.getStorage();
    expect(storage).toMatchObject({
      uploadsOpen: true,
      bytesLimit: 5_368_709_120,
      pageFilesBytes: 1000,
      byKind: { audio: 2048 },
      videoMinutesLimit: 300,
      limits: {
        video: 2048 * MB,
        audio: 500 * MB,
        image: 25 * MB,
        document: 100 * MB,
        file: 500 * MB,
      },
    });
  });
});
