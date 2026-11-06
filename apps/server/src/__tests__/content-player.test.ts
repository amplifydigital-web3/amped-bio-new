/**
 * PR 6a (Build Board #20, Fan Library #26 phase A): content.getReadUrl,
 * content.setCaptions and removeCaptions, and the progress router. The database
 * and Cloudflare are faked; delivery signing is faked to a marker so the tests
 * check decisions, not token bytes (content-delivery.test.ts covers those).
 * Handoff: docs/fixes/media-player.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const assets: Row[] = [];
  const progress: Row[] = [];
  const same = (a: any, b: any) =>
    a instanceof Uint8Array && b instanceof Uint8Array
      ? Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
      : a === b;
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
        if ("in" in value) return value.in.includes(row[key]);
      }
      return same(row[key] ?? null, value);
    });
  const prisma: any = {
    contentItem: {
      findUnique: vi.fn(async ({ where, include, select }: any) => {
        const row = items.find(item => matches(item, where));
        if (!row) return null;
        if (select) return { id: row.id };
        return include?.user ? { ...row, user: { ...row.user } } : { ...row };
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
      findUnique: vi.fn(
        async ({ where }: any) => assets.find(row => same(row.id, where.id)) ?? null
      ),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const row = assets.find(asset => same(asset.id, where.id));
        if (row) return Object.assign(row, update);
        assets.push({ ...create });
        return create;
      }),
      delete: vi.fn(async ({ where }: any) => {
        assets.splice(
          assets.findIndex(row => same(row.id, where.id)),
          1
        );
      }),
    },
    viewerProgress: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.userId_contentItemId;
        return (
          progress.find(
            row => row.userId === key.userId && same(row.contentItemId, key.contentItemId)
          ) ?? null
        );
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const key = where.userId_contentItemId;
        const row = progress.find(
          entry => entry.userId === key.userId && same(entry.contentItemId, key.contentItemId)
        );
        if (row) return Object.assign(row, update, { updatedAt: new Date() });
        const created = { ...create, updatedAt: new Date() };
        progress.push(created);
        return created;
      }),
    },
  };
  return { prisma, items, assets, progress };
});

const cf = vi.hoisted(() => ({
  putStreamCaptions: vi.fn(async () => {}),
  deleteStreamCaptions: vi.fn(async () => {}),
  putR2Object: vi.fn(async () => {}),
  deleteR2Object: vi.fn(async () => {}),
}));

const delivery = vi.hoisted(() => {
  class DeliveryError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  }
  return {
    DeliveryError,
    buildPlayback: vi.fn(async (item: any, _assets: any, access: string) => ({
      publicId: item.publicId,
      access,
    })),
    buildDownload: vi.fn(async (item: any) => ({ url: `dl:${item.publicId}` })),
  };
});

const limiter = vi.hoisted(() => ({ hits: new Map<string, number>() }));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({
  hitRateLimit: vi.fn(async (key: string) => {
    const next = (limiter.hits.get(key) ?? 0) + 1;
    limiter.hits.set(key, next);
    return next;
  }),
}));
vi.mock("../services/cloudflare/r2", () => cf);
vi.mock("../services/cloudflare/stream", () => cf);
vi.mock("../services/cloudflare/queue", () => ({ publishContentJob: vi.fn() }));
vi.mock("../services/content/delivery", () => delivery);
vi.mock("../services/analytics/visitorIp", () => ({ getVisitorIp: () => ({ ip: "203.0.113.9" }) }));

import { contentRouter } from "../trpc/content";
import { progressRouter } from "../trpc/progress";

const OWNER = 7;
const caller = (sub: number | null) =>
  contentRouter.createCaller({ user: sub === null ? undefined : { sub }, req: {} } as never);
const progressCaller = (sub: number) => progressRouter.createCaller({ user: { sub } } as never);

function addItem(extra: Record<string, unknown> = {}) {
  const row = {
    id: Buffer.alloc(16, db.items.length + 1),
    publicId: `item${String(db.items.length).padStart(12, "0")}`,
    userId: OWNER,
    kind: "VIDEO",
    title: "Point Reyes",
    status: "READY",
    publishState: "DRAFT",
    moderationState: "CLEAR",
    accessRuleId: null,
    adult: false,
    deletedAt: null,
    allowDownload: false,
    durationMs: 760_000,
    user: { page_status: "PUBLISHED", block: "no", handle: "maya", name: "Maya" },
    ...extra,
  };
  db.items.push(row);
  return row;
}

function addStream(item: { id: Buffer }) {
  db.assets.push({
    id: Buffer.alloc(16, 99),
    contentItemId: item.id,
    role: "STREAM",
    storage: "STREAM",
    streamUid: "uid-1",
    r2Key: null,
    scanStatus: "PENDING",
  });
}

beforeEach(() => {
  db.items.length = 0;
  db.assets.length = 0;
  db.progress.length = 0;
  limiter.hits.clear();
  Object.values(cf).forEach(fn => fn.mockClear());
  delivery.buildPlayback.mockClear();
  delivery.buildDownload.mockClear();
});

describe("content.getReadUrl", () => {
  it("lets the owner preview a draft with private lifetimes", async () => {
    const item = addItem();
    addStream(item);
    const result = await caller(OWNER).getReadUrl({ publicId: item.publicId });
    expect(result.playback).toEqual({ publicId: item.publicId, access: "private" });
    expect(result.download).toBeNull();
  });

  it("reads as not found to anyone else while the item is a draft", async () => {
    const item = addItem();
    await expect(caller(8).getReadUrl({ publicId: item.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller(null).getReadUrl({ publicId: item.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(caller(OWNER).getReadUrl({ publicId: "zzzzzzzzzzzzzzzz" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("opens a published public item to signed out viewers with public lifetimes", async () => {
    const item = addItem({ publishState: "PUBLISHED" });
    addStream(item);
    const result = await caller(null).getReadUrl({ publicId: item.publicId });
    expect(result.playback).toMatchObject({ access: "public" });
  });

  it("refuses 18+ and assets that failed their scan, even to signed in fans", async () => {
    const adult = addItem({ publishState: "PUBLISHED", adult: true });
    await expect(caller(8).getReadUrl({ publicId: adult.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const infected = addItem({ publishState: "PUBLISHED" });
    db.assets.push({ contentItemId: infected.id, role: "COVER", scanStatus: "INFECTED" });
    await expect(caller(8).getReadUrl({ publicId: infected.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("hands out downloads only when allowed, up to 10 a day per viewer", async () => {
    const off = addItem({ publishState: "PUBLISHED" });
    await expect(
      caller(8).getReadUrl({ publicId: off.publicId, download: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const on = addItem({ publishState: "PUBLISHED", allowDownload: true });
    for (let i = 0; i < 10; i += 1) {
      const result = await caller(8).getReadUrl({ publicId: on.publicId, download: true });
      expect(result.download).toEqual({ url: `dl:${on.publicId}` });
    }
    await expect(
      caller(8).getReadUrl({ publicId: on.publicId, download: true })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // Another viewer has their own allowance
    await expect(
      caller(9).getReadUrl({ publicId: on.publicId, download: true })
    ).resolves.toBeTruthy();
  });

  it("limits reads to 30 a minute per viewer", async () => {
    const item = addItem();
    for (let i = 0; i < 30; i += 1) await caller(OWNER).getReadUrl({ publicId: item.publicId });
    await expect(caller(OWNER).getReadUrl({ publicId: item.publicId })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("answers not found when there is nothing to deliver", async () => {
    const item = addItem();
    delivery.buildPlayback.mockRejectedValueOnce(new delivery.DeliveryError("not_ready"));
    await expect(caller(OWNER).getReadUrl({ publicId: item.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

const VTT = "WEBVTT\r\n\r\n00:00.000 --> 00:02.000\r\nSurf and wind\r\n";

describe("content.setCaptions and removeCaptions", () => {
  it("sends video captions to Stream and records one row per language", async () => {
    const item = addItem();
    addStream(item);
    const first = await caller(OWNER).setCaptions({
      publicId: item.publicId,
      lang: "en",
      vtt: VTT,
    });
    expect(first.captions).toEqual([{ lang: "en", label: "English" }]);
    expect(cf.putStreamCaptions).toHaveBeenCalledWith(
      "uid-1",
      "en",
      "WEBVTT\n\n00:00.000 --> 00:02.000\nSurf and wind\n"
    );
    // Replacing a language keeps one row
    await caller(OWNER).setCaptions({ publicId: item.publicId, lang: "en", vtt: VTT });
    expect(db.assets.filter(row => row.role === "CAPTION")).toHaveLength(1);
  });

  it("writes audio captions to R2 under derived/ for the gateway", async () => {
    const item = addItem({ kind: "AUDIO" });
    await caller(OWNER).setCaptions({ publicId: item.publicId, lang: "pt-BR", vtt: VTT });
    expect(cf.putR2Object).toHaveBeenCalledWith(
      `derived/${item.publicId}/captions/pt-BR.vtt`,
      expect.stringMatching(/^WEBVTT\n/),
      "text/vtt; charset=utf-8"
    );
    const row = db.assets.find(asset => asset.role === "CAPTION")!;
    expect(row).toMatchObject({ storage: "R2", scanStatus: "SKIPPED", lang: "pt-BR" });
    const removed = await caller(OWNER).removeCaptions({ publicId: item.publicId, lang: "pt-BR" });
    expect(removed.captions).toEqual([]);
    expect(cf.deleteR2Object).toHaveBeenCalledWith(`derived/${item.publicId}/captions/pt-BR.vtt`);
  });

  it("refuses a file that is not WebVTT, other kinds, unfinished items and a sixth language", async () => {
    const item = addItem({ kind: "AUDIO" });
    await expect(
      caller(OWNER).setCaptions({
        publicId: item.publicId,
        lang: "en",
        vtt: "1\n00:00:00,000 --> 00:00:02,000\nHi",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const image = addItem({ kind: "IMAGE" });
    await expect(
      caller(OWNER).setCaptions({ publicId: image.publicId, lang: "en", vtt: VTT })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const processing = addItem({ kind: "AUDIO", status: "PROCESSING" });
    await expect(
      caller(OWNER).setCaptions({ publicId: processing.publicId, lang: "en", vtt: VTT })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const lang of ["en", "es", "fr", "de", "it"]) {
      await caller(OWNER).setCaptions({ publicId: item.publicId, lang, vtt: VTT });
    }
    await expect(
      caller(OWNER).setCaptions({ publicId: item.publicId, lang: "ja", vtt: VTT })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is the owner's alone", async () => {
    const item = addItem();
    await expect(
      caller(8).setCaptions({ publicId: item.publicId, lang: "en", vtt: VTT })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("progress router", () => {
  it("saves and returns the position for a viewer who can open the item", async () => {
    const item = addItem({ publishState: "PUBLISHED" });
    expect(await progressCaller(8).get({ publicId: item.publicId })).toBeNull();
    await expect(
      progressCaller(8).set({ publicId: item.publicId, positionMs: 492_000, durationMs: 760_000 })
    ).resolves.toEqual({ saved: true });
    expect(await progressCaller(8).get({ publicId: item.publicId })).toMatchObject({
      positionMs: 492_000,
      durationMs: 760_000,
      completed: false,
    });
    // Another account keeps its own position
    expect(await progressCaller(9).get({ publicId: item.publicId })).toBeNull();
  });

  it("marks an item finished at 95 percent and clamps past the end", async () => {
    const item = addItem({ publishState: "PUBLISHED" });
    await progressCaller(8).set({ publicId: item.publicId, positionMs: 900_000 });
    expect(await progressCaller(8).get({ publicId: item.publicId })).toMatchObject({
      positionMs: 760_000,
      completed: true,
    });
  });

  it("ignores writes from viewers who can not open the item", async () => {
    const item = addItem();
    await expect(
      progressCaller(8).set({ publicId: item.publicId, positionMs: 1000 })
    ).resolves.toEqual({ saved: false });
    expect(db.progress).toHaveLength(0);
    await expect(
      progressCaller(OWNER).set({ publicId: item.publicId, positionMs: 1000 })
    ).resolves.toEqual({ saved: true });
  });

  it("limits writes to 12 a minute per item", async () => {
    const item = addItem({ publishState: "PUBLISHED" });
    for (let i = 0; i < 12; i += 1) {
      await progressCaller(8).set({ publicId: item.publicId, positionMs: i * 10_000 });
    }
    await expect(
      progressCaller(8).set({ publicId: item.publicId, positionMs: 130_000 })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
