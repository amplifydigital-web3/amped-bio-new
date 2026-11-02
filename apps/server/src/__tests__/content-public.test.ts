/**
 * PR 6 (Build Board #20, spec 3.7, 3.10, 3.12): publishing, soft delete and
 * restore, retryProcessing, the public reads (cards, feed, item page), reports,
 * the purge, and content block ids on save. The database and Cloudflare are
 * faked; card signing is faked to markers (content-delivery.test.ts covers it).
 * Handoff: docs/fixes/content-public-pages.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const assets: Row[] = [];
  const progress: Row[] = [];
  const reports: Row[] = [];
  const same = (a: any, b: any) =>
    a instanceof Uint8Array && b instanceof Uint8Array
      ? Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
      : a === b;
  const test = (value: any, cond: any): boolean => {
    if (
      cond &&
      typeof cond === "object" &&
      !(cond instanceof Uint8Array) &&
      !(cond instanceof Date)
    ) {
      if ("in" in cond) return cond.in.some((v: any) => same(v, value));
      if ("not" in cond) return !same(value ?? null, cond.not);
      if ("gt" in cond) return value != null && value > cond.gt;
      if ("lte" in cond) return value != null && value <= cond.lte;
    }
    return same(value ?? null, cond);
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, cond]) => test(row[key], cond));
  const copy = (row: Row) => ({ ...row });
  const prisma: any = {
    user: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.handle === "maya" && where.page_status === "PUBLISHED" && where.block === "no"
          ? { id: 7, handle: "maya", name: "Maya Lin", image: null, image_file_id: null }
          : null
      ),
    },
    contentItem: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = items.find(item => matches(item, where));
        if (!row) return null;
        return include?.user ? { ...row, user: { ...row.user } } : copy(row);
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        const row = items.find(item => matches(item, where));
        return row ? copy(row) : null;
      }),
      findMany: vi.fn(async ({ where, take }: any) =>
        items
          .filter(row => matches(row, where))
          .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
          .slice(0, take ?? 1000)
          .map(copy)
      ),
      count: vi.fn(async ({ where }: any) => items.filter(row => matches(row, where)).length),
      update: vi.fn(async ({ where, data }: any) =>
        copy(Object.assign(items.find(row => matches(row, where))!, data))
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = items.filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
    contentAsset: {
      findMany: vi.fn(async ({ where }: any) => assets.filter(row => matches(row, where))),
      findFirst: vi.fn(
        async ({ where }: any) =>
          assets.find(
            row => same(row.contentItemId, where.contentItemId) && where.role.in.includes(row.role)
          ) ?? null
      ),
      create: vi.fn(async ({ data }: any) => {
        assets.push({ scanStatus: "PENDING", ...data });
        return data;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const keep = assets.filter(row => !matches(row, where));
        const count = assets.length - keep.length;
        assets.splice(0, assets.length, ...keep);
        return { count };
      }),
    },
    viewerProgress: {
      deleteMany: vi.fn(async ({ where }: any) => {
        const keep = progress.filter(row => !matches(row, where));
        progress.splice(0, progress.length, ...keep);
        return { count: 0 };
      }),
    },
    contentReport: {
      create: vi.fn(async ({ data }: any) => {
        reports.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, items, assets, progress, reports };
});

const cf = vi.hoisted(() => ({
  getStreamVideo: vi.fn(
    async (): Promise<any> => ({ readyToStream: true, status: { state: "ready" } })
  ),
  deleteStreamVideo: vi.fn(async () => {}),
  enableStreamDownloads: vi.fn(async () => ({})),
  createStreamDirectUpload: vi.fn(async () => ({
    uploadUrl: "https://upload/tus/x",
    uid: "new-uid",
  })),
  updateStreamVideo: vi.fn(async () => ({})),
  r2ObjectExists: vi.fn(async () => false),
  deleteR2Object: vi.fn(async () => {}),
  presignR2Put: vi.fn(async () => "https://r2/put"),
  createR2Multipart: vi.fn(async () => "up-1"),
}));

const quotaState = vi.hoisted(() => ({ taken: 0n, limit: 4096n }));

const quota = vi.hoisted(() => ({
  ensureQuota: vi.fn(async () => ({ videoMinutesLimit: 300, videoMinutesUsed: 0 })),
  // A real quota: the bytes handed out count against the limit
  reserveBytes: vi.fn(async (_userId: number, bytes: bigint) => {
    if (quotaState.taken + bytes > quotaState.limit) return false;
    quotaState.taken += bytes;
    return true;
  }),
  releaseBytes: vi.fn(async () => {}),
  freeUsedBytes: vi.fn(async () => {}),
}));

const jobs = vi.hoisted(() => ({
  publishContentJob: vi.fn(async () => {}),
  enqueueVideoProcessing: vi.fn(async () => {}),
}));

const limiter = vi.hoisted(() => ({ hits: new Map<string, number>() }));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../utils/rateLimit", () => ({
  hitRateLimit: vi.fn(async (key: string) => {
    const next = (limiter.hits.get(key) ?? 0) + 1;
    limiter.hits.set(key, next);
    return next;
  }),
}));
vi.mock("../services/cloudflare/r2", () => cf);
vi.mock("../services/cloudflare/stream", () => cf);
vi.mock("../services/cloudflare/queue", () => ({ publishContentJob: jobs.publishContentJob }));
vi.mock("../services/content/quota", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/quota")>()),
  ...quota,
}));
vi.mock("../services/content/state", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/state")>()),
  enqueueVideoProcessing: jobs.enqueueVideoProcessing,
}));
vi.mock("../services/content/delivery", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/delivery")>()),
  buildCard: (item: any) => ({ publicId: item.publicId, title: item.title, cover: null }),
}));
vi.mock("../services/analytics/visitorIp", () => ({ getVisitorIp: () => ({ ip: "203.0.113.9" }) }));

import { env } from "../env";
import { contentRouter } from "../trpc/content";
import { purgeDeletedItems } from "../services/content/purge";
import { publicCardsFor } from "../services/content/publicView";
import { keepOwnedContentIds } from "../services/content/blockConfig";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";

const OWNER = 7;
const caller = (sub: number | null) =>
  contentRouter.createCaller({ user: sub === null ? undefined : { sub }, req: {} } as never);

let seq = 0;
function addItem(extra: Record<string, unknown> = {}) {
  seq += 1;
  const row = {
    id: Buffer.alloc(16, seq),
    publicId: `item${String(seq).padStart(12, "0")}`,
    userId: OWNER,
    kind: "AUDIO",
    title: `Item ${seq}`,
    description: null,
    status: "READY",
    publishState: "DRAFT",
    moderationState: "CLEAR",
    moderationReason: null,
    accessRuleId: null,
    adult: false,
    allowDownload: false,
    deletedAt: null,
    purgeAfter: null,
    publishedAt: null,
    processingStep: null,
    failureReason: null,
    previewConfig: null,
    chapters: null,
    durationMs: 125_000,
    pageCount: null,
    width: null,
    height: null,
    totalBytes: 2048n,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { page_status: "PUBLISHED", block: "no" },
    ...extra,
  };
  db.items.push(row);
  return row;
}

beforeEach(() => {
  db.items.length = 0;
  db.assets.length = 0;
  db.progress.length = 0;
  db.reports.length = 0;
  limiter.hits.clear();
  [...Object.values(cf), ...Object.values(quota), ...Object.values(jobs)].forEach(fn =>
    fn.mockClear()
  );
  quotaState.taken = 0n;
  cf.r2ObjectExists.mockResolvedValue(false);
  Object.assign(env, {
    CONTENT_UPLOADS_ENABLED: true,
    CF_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "amped-content-test",
    CF_STREAM_API_TOKEN: "token",
    CF_QUEUES_API_TOKEN: "queues",
    CF_CONTENT_QUEUE_ID: "queue-id",
  });
});

describe("publish and unpublish", () => {
  it("publishes a ready, cleared item and keeps the first publish date", async () => {
    const item = addItem();
    const published = await caller(OWNER).publish({ publicId: item.publicId });
    expect(published.publishState).toBe("published");
    const first = published.publishedAt;
    expect(first).toBeInstanceOf(Date);
    await caller(OWNER).unpublish({ publicId: item.publicId });
    expect(db.items[0]!.publishState).toBe("DRAFT");
    const again = await caller(OWNER).publish({ publicId: item.publicId });
    expect(again.publishedAt).toEqual(first);
  });

  it("refuses items still processing, in review or blocked, and other people's items", async () => {
    const processing = addItem({ status: "PROCESSING" });
    const held = addItem({ moderationState: "HELD" });
    const blocked = addItem({ status: "BLOCKED", moderationState: "BLOCKED" });
    await expect(caller(OWNER).publish({ publicId: processing.publicId })).rejects.toMatchObject({
      message: "Publish once processing finishes.",
    });
    await expect(caller(OWNER).publish({ publicId: held.publicId })).rejects.toMatchObject({
      message: "This item is in review. You can publish it once a reviewer clears it.",
    });
    await expect(caller(OWNER).publish({ publicId: blocked.publicId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const mine = addItem();
    await expect(caller(8).publish({ publicId: mine.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("publishes only a READY, CLEAR, non 18+ item", async () => {
    const adult = addItem({ adult: true });
    const pending = addItem({ moderationState: "PENDING" });
    await expect(caller(OWNER).publish({ publicId: adult.publicId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "18+ items can not be published yet.",
    });
    await expect(caller(OWNER).publish({ publicId: pending.publicId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This item is not cleared yet. A reviewer clears it before it can be published.",
    });
    // Neither one reached the creator's pages
    expect(db.items.find(row => row.publicId === adult.publicId)!.publishState).toBe("DRAFT");
    expect(db.items.find(row => row.publicId === pending.publicId)!.publishState).toBe("DRAFT");
  });
});

describe("delete and restore (spec 3.12)", () => {
  it("soft deletes a ready item: off every page, space still taken, restorable for 30 days", async () => {
    const item = addItem({ kind: "VIDEO", publishState: "PUBLISHED", durationMs: 760_000 });
    const result = await caller(OWNER).delete({ publicId: item.publicId });
    expect(result.restorableUntil!.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
    expect(db.items[0]).toMatchObject({ status: "DELETED", publishState: "DRAFT" });
    // The files stay in the bucket until the purge, so the space stays charged
    expect(quota.freeUsedBytes).not.toHaveBeenCalled();
    const removed = await caller(OWNER).list({ removed: true, limit: 30 });
    expect(removed.items.map(row => row.publicId)).toEqual([item.publicId]);
    expect((await caller(OWNER).list({ limit: 30 })).items).toHaveLength(0);
  });

  it("keeps the storage limit in place after a delete", async () => {
    quotaState.taken = quotaState.limit;
    const item = addItem({ kind: "VIDEO", durationMs: 760_000 });
    await caller(OWNER).delete({ publicId: item.publicId });
    // Nothing was freed, so the limit still covers the files that are in the
    // bucket until the purge
    expect(quota.freeUsedBytes).not.toHaveBeenCalled();
    await expect(
      caller(OWNER).createUpload({
        kind: "audio",
        fileName: "a.mp3",
        mimeType: "audio/mpeg",
        size: 1024,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Not enough storage left"),
    });
  });

  it("restores as a draft, and the space was never given back", async () => {
    const item = addItem();
    await caller(OWNER).delete({ publicId: item.publicId });
    const restored = await caller(OWNER).restore({ publicId: item.publicId });
    expect(restored).toMatchObject({
      status: "ready",
      publishState: "draft",
      restorableUntil: null,
    });
    expect(db.items[0]).toMatchObject({ status: "READY", deletedAt: null, purgeAfter: null });
    // The delete freed nothing, so the restore reclaims nothing: no double count
    expect(quota.freeUsedBytes).not.toHaveBeenCalled();
    expect(quota.reserveBytes).not.toHaveBeenCalled();
  });

  it("purges failed and blocked items at once and never restores them", async () => {
    const failed = addItem({ status: "FAILED" });
    const result = await caller(OWNER).delete({ publicId: failed.publicId });
    expect(result.restorableUntil).toBeNull();
    expect(quota.freeUsedBytes).not.toHaveBeenCalled();
    await expect(caller(OWNER).restore({ publicId: failed.publicId })).rejects.toMatchObject({
      message: "This item can no longer be restored.",
    });
  });

  it("waits for uploads and processing to finish", async () => {
    const busy = addItem({ status: "PROCESSING" });
    await expect(caller(OWNER).delete({ publicId: busy.publicId })).rejects.toMatchObject({
      message: "Wait until processing finishes, or cancel the upload.",
    });
  });
});

describe("retryProcessing", () => {
  it("re-runs a video Stream still holds, once an hour", async () => {
    const item = addItem({ kind: "VIDEO", status: "FAILED", failureReason: "classifier_failed" });
    db.assets.push({ contentItemId: item.id, role: "STREAM", streamUid: "uid-1" });
    const result = await caller(OWNER).retryProcessing({ publicId: item.publicId });
    expect(result).toEqual({ status: "processing", publicId: item.publicId });
    expect(db.items[0]).toMatchObject({
      status: "PROCESSING",
      processingStep: "stream_ready",
      failureReason: null,
    });
    expect(quota.reserveBytes).toHaveBeenCalledWith(OWNER, 2048n);
    expect(jobs.enqueueVideoProcessing).toHaveBeenCalledWith(item.publicId);
    // Fails again, and the hourly limit holds
    db.items[0]!.status = "FAILED";
    await expect(caller(OWNER).retryProcessing({ publicId: item.publicId })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("re-queues an R2 upload that is still kept", async () => {
    const item = addItem({ status: "FAILED", failureReason: "processing_timeout" });
    db.assets.push({
      contentItemId: item.id,
      role: "ORIGINAL",
      r2Key: `incoming/${item.publicId}/original.mp3`,
    });
    cf.r2ObjectExists.mockResolvedValueOnce(true);
    await expect(caller(OWNER).retryProcessing({ publicId: item.publicId })).resolves.toMatchObject(
      {
        status: "processing",
      }
    );
    expect(jobs.publishContentJob).toHaveBeenCalledWith({ type: "r2", publicId: item.publicId });
  });

  it("asks for the file when the upload is gone, then uploads it into the same item", async () => {
    const item = addItem({
      status: "FAILED",
      failureReason: "type_mismatch",
      title: "Low Tide EP",
    });
    db.assets.push({
      contentItemId: item.id,
      role: "ORIGINAL",
      r2Key: `incoming/${item.publicId}/original.mp3`,
    });
    db.assets.push({ contentItemId: item.id, role: "WAVEFORM", r2Key: "derived/x" });
    expect(await caller(OWNER).retryProcessing({ publicId: item.publicId })).toEqual({
      status: "needs_file",
      publicId: item.publicId,
    });
    const result = await caller(OWNER).retryProcessing({
      publicId: item.publicId,
      file: { fileName: "stems.mp3", mimeType: "audio/mpeg", size: 4096 },
    });
    expect(result).toMatchObject({
      status: "uploading",
      publicId: item.publicId,
      target: { type: "put" },
    });
    expect(db.items[0]).toMatchObject({
      status: "UPLOADING",
      totalBytes: 4096n,
      title: "Low Tide EP",
      failureReason: null,
    });
    // Old rows gone, one new ORIGINAL waiting for the bytes
    expect(db.assets.map(row => row.role)).toEqual(["ORIGINAL"]);
    expect(quota.reserveBytes).toHaveBeenCalledWith(OWNER, 4096n);
  });

  it("refuses a retry without a file when the video minutes are gone", async () => {
    const item = addItem({ kind: "VIDEO", status: "FAILED", durationMs: 125_000 });
    db.assets.push({ contentItemId: item.id, role: "STREAM", streamUid: "uid-1" });
    // The item is 3 minutes long and the creator has 2 left
    quota.ensureQuota.mockResolvedValueOnce({ videoMinutesLimit: 300, videoMinutesUsed: 298 });
    await expect(caller(OWNER).retryProcessing({ publicId: item.publicId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This video is longer than your video minutes left.",
    });
    expect(quota.reserveBytes).not.toHaveBeenCalled();
  });

  it("refuses a file of another kind and items that did not fail", async () => {
    const item = addItem({ status: "FAILED" });
    await expect(
      caller(OWNER).retryProcessing({
        publicId: item.publicId,
        file: { fileName: "clip.mp4", mimeType: "video/mp4", size: 10 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const ready = addItem();
    await expect(caller(OWNER).retryProcessing({ publicId: ready.publicId })).rejects.toMatchObject(
      {
        message: "Only items that failed can be retried.",
      }
    );
  });
});

describe("public reads", () => {
  it("shows only public items on a bio block, in any order asked", async () => {
    const pub = addItem({ publishState: "PUBLISHED", publishedAt: new Date() });
    const draft = addItem();
    const adult = addItem({ publishState: "PUBLISHED", adult: true });
    const other = addItem({ publishState: "PUBLISHED", userId: 99 });
    const { cards } = await caller(null).listForBio({
      handle: "@Maya",
      publicIds: [draft.publicId, pub.publicId, adult.publicId, other.publicId],
    });
    expect(Object.keys(cards)).toEqual([pub.publicId]);
    expect(await caller(null).listForBio({ handle: "nobody", publicIds: [pub.publicId] })).toEqual({
      cards: {},
    });
  });

  it("shows the cards of every content block on the page, past the first lookup", async () => {
    const items = Array.from({ length: 70 }, () =>
      addItem({ publishState: "PUBLISHED", publishedAt: new Date() })
    );
    const cards = await publicCardsFor(
      OWNER,
      items.map(item => item.publicId)
    );
    expect(Object.keys(cards)).toHaveLength(70);
  });

  it("skips items with an asset that has not passed its scan", async () => {
    const dirty = addItem({ publishState: "PUBLISHED" });
    db.assets.push({ contentItemId: dirty.id, role: "COVER", scanStatus: "ERROR" });
    const { cards } = await caller(null).listForBio({
      handle: "maya",
      publicIds: [dirty.publicId],
    });
    expect(cards).toEqual({});
  });

  it("serves the feed newest first and the item page, and 404s a draft", async () => {
    const older = addItem({ publishState: "PUBLISHED", publishedAt: new Date("2026-10-01") });
    const newer = addItem({
      publishState: "PUBLISHED",
      publishedAt: new Date("2026-10-20"),
      chapters: [{ startMs: 0, title: "Start" }, { bad: true }],
    });
    db.assets.push({ contentItemId: newer.id, role: "CAPTION", lang: "en", scanStatus: "SKIPPED" });
    addItem();
    const feed = await caller(null).feed({ handle: "maya", limit: 24 });
    expect(feed.items.map(card => card.publicId)).toEqual([newer.publicId, older.publicId]);
    expect(feed.creator).toEqual({ handle: "maya", name: "Maya Lin", image: null });
    expect(JSON.stringify(feed)).not.toMatch(/"id"|userId|email/);

    const page = await caller(null).getPublic({ handle: "maya", publicId: newer.publicId });
    expect(page.chapters).toEqual([{ startMs: 0, title: "Start" }]);
    expect(page.captionLangs).toEqual(["en"]);
    const draft = addItem();
    await expect(
      caller(null).getPublic({ handle: "maya", publicId: draft.publicId })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller(null).feed({ handle: "nobody", limit: 24 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("report", () => {
  it("records a report on a public item and raises an alert for CSAM", async () => {
    const item = addItem({ publishState: "PUBLISHED" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      caller(null).report({ publicId: item.publicId, reason: "csam", details: "  see 0:12  " })
    ).resolves.toEqual({ received: true });
    expect(db.reports[0]).toMatchObject({
      reason: "csam",
      details: "see 0:12",
      reporterUserId: null,
    });
    expect(error).toHaveBeenCalledWith(
      "[content] ALERT csam report",
      expect.stringContaining(item.publicId)
    );
    // A report never takes anything down by itself
    expect(db.items[0]).toMatchObject({ publishState: "PUBLISHED", moderationState: "CLEAR" });
    error.mockRestore();
  });

  it("is limited to 10 an hour and hides drafts", async () => {
    const draft = addItem();
    await expect(
      caller(8).report({ publicId: draft.publicId, reason: "other" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const item = addItem({ publishState: "PUBLISHED" });
    for (let i = 0; i < 9; i += 1)
      await caller(8).report({ publicId: item.publicId, reason: "other" });
    await expect(
      caller(8).report({ publicId: item.publicId, reason: "other" })
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});

describe("purge", () => {
  it("removes files, Stream videos, rows and positions once the window passed, and keeps the record", async () => {
    const due = addItem({ status: "DELETED", purgeAfter: new Date(Date.now() - 1000) });
    const waiting = addItem({ status: "DELETED", purgeAfter: new Date(Date.now() + 86_400_000) });
    db.assets.push(
      { contentItemId: due.id, role: "STREAM", streamUid: "u1", r2Key: null },
      { contentItemId: due.id, role: "PREVIEW_CLIP", streamUid: "u2", r2Key: null },
      { contentItemId: due.id, role: "COVER", streamUid: null, r2Key: "derived/a/cover/640.webp" },
      {
        contentItemId: waiting.id,
        role: "COVER",
        streamUid: null,
        r2Key: "derived/b/cover/640.webp",
      }
    );
    db.progress.push({ contentItemId: due.id }, { contentItemId: waiting.id });
    expect(await purgeDeletedItems()).toBe(1);
    expect(cf.deleteStreamVideo.mock.calls.map(call => call[0])).toEqual(["u1", "u2"]);
    expect(cf.deleteR2Object).toHaveBeenCalledWith("derived/a/cover/640.webp");
    expect(db.assets).toHaveLength(1);
    expect(db.progress).toHaveLength(1);
    expect(db.items.find(row => row.publicId === due.publicId)).toMatchObject({
      status: "DELETED",
      purgeAfter: null,
    });
  });

  it("leaves an item for the next run when storage fails", async () => {
    const due = addItem({ status: "DELETED", purgeAfter: new Date(Date.now() - 1000) });
    db.assets.push({ contentItemId: due.id, role: "COVER", r2Key: "derived/a/c.webp" });
    cf.deleteR2Object.mockRejectedValueOnce(new Error("r2 down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await purgeDeletedItems()).toBe(0);
    expect(db.items[0]!.purgeAfter).not.toBeNull();
    expect(db.assets).toHaveLength(1);
    error.mockRestore();
  });

  it("gives the space back only for the items that held it", async () => {
    const now = Date.now();
    // Deleted while live: the files stayed in the bucket, so the space was held
    const live = addItem({
      status: "DELETED",
      kind: "VIDEO",
      durationMs: 125_000,
      deletedAt: new Date(now - 40 * 24 * 3600 * 1000),
      purgeAfter: new Date(now - 1000),
    });
    // Failed items gave their space back when they failed and hold nothing
    const failed = addItem({
      status: "DELETED",
      deletedAt: new Date(now - 1000),
      purgeAfter: new Date(now - 1000),
    });
    expect(await purgeDeletedItems()).toBe(2);
    expect(quota.freeUsedBytes).toHaveBeenCalledTimes(1);
    expect(quota.freeUsedBytes).toHaveBeenCalledWith(OWNER, 2048n, 3, expect.anything());
    expect(db.items.find(row => row.publicId === live.publicId)!.purgeAfter).toBeNull();
    expect(db.items.find(row => row.publicId === failed.publicId)!.purgeAfter).toBeNull();
  });
});

describe("content blocks on save", () => {
  it("keeps label, layout and up to 12 unique ids, nothing else", () => {
    const config = sanitizeBlockConfig("content", {
      label: "  Latest  ",
      layout: "grid",
      publicIds: ["aaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"],
      url: "https://evil.example",
    } as Record<string, unknown>);
    expect(config).toEqual({
      label: "Latest",
      layout: "grid",
      publicIds: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"],
    });
    expect(sanitizeBlockConfig("content", { layout: "carousel", hidden: true })).toEqual({
      label: "Latest",
      layout: "featured",
      publicIds: [],
      hidden: true,
    });
  });

  it("drops ids of someone else's items and of removed items, keeping order", async () => {
    const mine = addItem();
    const theirs = addItem({ userId: 99 });
    const removed = addItem({ status: "DELETED" });
    const second = addItem();
    const config = await keepOwnedContentIds(OWNER, "content", {
      label: "",
      layout: "list",
      publicIds: [second.publicId, theirs.publicId, removed.publicId, mine.publicId],
    });
    expect(config.publicIds).toEqual([second.publicId, mine.publicId]);
  });
});
