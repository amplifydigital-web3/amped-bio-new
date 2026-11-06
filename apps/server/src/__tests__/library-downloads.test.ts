/**
 * Fan Library offline downloads (Build Board #26, FL-5, spec 3.5 Offline,
 * decision C). The rules that matter: a copy only where the creator allows
 * downloads and the fan may list the item; one record per copy on one app;
 * the check closes copies the fan may no longer keep and names why; records
 * are the fan's own. The database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), findMany: fn() },
    theme: { findMany: fn() },
    contentItem: { findUnique: fn() },
    contentAsset: { findMany: fn() },
    viewerProgress: { findMany: fn() },
    savedItem: { findMany: fn() },
    offerItem: { findMany: fn() },
    purchase: { findMany: fn() },
    membership: { findMany: fn() },
    downloadRecord: {
      create: fn(),
      findUnique: fn(),
      findMany: fn(),
      update: fn(),
      updateMany: fn(),
    },
  };
});
const limits = vi.hoisted(() => ({ hits: 1 }));
const delivery = vi.hoisted(() => ({ reason: null as null | "no_download" | "not_ready" }));
/** The gating engine's answer for gated items (accessGating on) */
const engine = vi.hoisted(() => ({ allowed: false }));

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => limits.hits) }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../services/follow/poolFans", () => ({
  batchPoolFanCreatorIds: vi.fn(async () => new Set<number>()),
}));
vi.mock("../services/access/engine", () => ({
  checkBatch: vi.fn(
    async (_viewer: unknown, resources: Array<{ type: string; id: string }>) =>
      new Map(
        resources.map(resource => [
          `${resource.type}:${resource.id}`,
          {
            allowed: engine.allowed,
            reason: engine.allowed ? "rule_passed" : "not_pool_member",
            hint: { action: "stake" },
            rule: engine.allowed
              ? { id: "1".repeat(32), kind: "pool_member", summary: "Pool fans" }
              : null,
            checkedAt: new Date().toISOString(),
          },
        ])
      )
  ),
}));
vi.mock("../services/content/publicView", () => ({
  cardsForItems: vi.fn(
    async (
      items: Array<{ publicId: string; title: string; kind: string; allowDownload: boolean }>
    ) =>
      new Map(
        items.map(item => [
          item.publicId,
          {
            publicId: item.publicId,
            kind: item.kind.toLowerCase(),
            title: item.title,
            durationMs: 760_000,
            pageCount: null,
            publishedAt: null,
            cover: null,
            blur: null,
            allowDownload: item.allowDownload,
          },
        ])
      )
  ),
}));
vi.mock("../services/content/delivery", async () => {
  class DeliveryError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  }
  return {
    DeliveryError,
    buildDownload: vi.fn(
      async (item: { publicId: string }, _assets: unknown, _now: Date, jti: string) => {
        if (delivery.reason) throw new DeliveryError(delivery.reason);
        return {
          url: `https://usercontent.amped.bio/x?t=${jti}`,
          fileName: `${item.publicId}.mp4`,
          expiresAt: 1,
        };
      }
    ),
  };
});

import { libraryRouter } from "../trpc/library";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { buildDownload } from "../services/content/delivery";

const FAN = 7;
const MAYA = 3;
const DEVICE = "dev_abcdefghijklmnop";
const fan = libraryRouter.createCaller({ user: { sub: FAN } } as never);
const publicCreator = { page_status: "PUBLISHED", block: "no" };

let seq = 0;
function item(extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: Buffer.alloc(16, seq),
    publicId: `item${String(seq).padStart(12, "0")}`,
    userId: MAYA,
    kind: "VIDEO",
    title: `Item ${seq}`,
    durationMs: 760_000,
    status: "READY",
    publishState: "PUBLISHED",
    moderationState: "CLEAR",
    accessRuleId: null,
    adult: false,
    deletedAt: null,
    hiddenAt: null,
    allowDownload: true,
    user: publicCreator,
    ...extra,
  };
}
const mayaUser = {
  id: MAYA,
  handle: "maya",
  name: "Maya Lin",
  image: null,
  image_file_id: null,
  theme: null,
};
const hex = (b: Buffer) => b.toString("hex");

beforeEach(() => {
  vi.clearAllMocks();
  limits.hits = 1;
  delivery.reason = null;
  engine.allowed = false;
  __setFeatureFlagOverridesForTests({ fanLibrary: true });
  db.user.findMany.mockResolvedValue([mayaUser]);
  db.theme.findMany.mockResolvedValue([]);
  db.viewerProgress.findMany.mockResolvedValue([]);
  db.savedItem.findMany.mockResolvedValue([]);
  db.offerItem.findMany.mockResolvedValue([]);
  db.purchase.findMany.mockResolvedValue([]);
  db.membership.findMany.mockResolvedValue([]);
  db.contentAsset.findMany.mockResolvedValue([{ role: "STREAM", scanStatus: "SKIPPED" }]);
  db.downloadRecord.create.mockResolvedValue({});
  db.downloadRecord.update.mockResolvedValue({});
  db.downloadRecord.updateMany.mockResolvedValue({ count: 0 });
});

describe("recordDownload", () => {
  it("writes one record with the grant id and returns a single use link", async () => {
    const video = item();
    db.contentItem.findUnique.mockResolvedValue(video);
    const grant = await fan.recordDownload({ publicId: video.publicId, device: DEVICE });
    expect(grant.id).toMatch(/^[0-9a-f]{32}$/);
    expect(grant.item.publicId).toBe(video.publicId);
    expect(grant.item.owner.handle).toBe("maya");
    const jti = vi.mocked(buildDownload).mock.calls[0]![3];
    expect(grant.url).toContain(jti);
    expect(db.downloadRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: FAN,
        contentItemId: video.id,
        grantJti: jti,
        device: DEVICE,
      }),
    });
  });

  it("refuses when the creator does not allow downloads", async () => {
    db.contentItem.findUnique.mockResolvedValue(item({ allowDownload: false }));
    await expect(
      fan.recordDownload({ publicId: "item000000000099", device: DEVICE })
    ).rejects.toThrow("The creator does not allow downloads for this item.");
    expect(db.downloadRecord.create).not.toHaveBeenCalled();
  });

  it("refuses photos, items the fan may not list, and their own items", async () => {
    db.contentItem.findUnique.mockResolvedValue(item({ kind: "IMAGE" }));
    await expect(
      fan.recordDownload({ publicId: "item000000000098", device: DEVICE })
    ).rejects.toThrow("does not allow downloads");
    db.contentItem.findUnique.mockResolvedValue(item({ accessRuleId: Buffer.alloc(16, 1) }));
    await expect(
      fan.recordDownload({ publicId: "item000000000097", device: DEVICE })
    ).rejects.toThrow("This item is not available.");
    db.contentItem.findUnique.mockResolvedValue(item({ userId: FAN }));
    await expect(
      fan.recordDownload({ publicId: "item000000000096", device: DEVICE })
    ).rejects.toThrow("This item is not available.");
    expect(db.downloadRecord.create).not.toHaveBeenCalled();
  });

  it("allows a gated item the fan can open and refuses one the engine refuses", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: true });
    const gated = item({ accessRuleId: Buffer.alloc(16, 3) });
    db.contentItem.findUnique.mockResolvedValue(gated);
    engine.allowed = true;
    await expect(
      fan.recordDownload({ publicId: gated.publicId, device: DEVICE })
    ).resolves.toEqual(expect.objectContaining({ id: expect.any(String) }));

    engine.allowed = false;
    await expect(
      fan.recordDownload({ publicId: gated.publicId, device: DEVICE })
    ).rejects.toThrow("This item is not available.");
  });

  it("refuses an item whose files have not passed the scan", async () => {
    db.contentItem.findUnique.mockResolvedValue(item({ kind: "FILE" }));
    db.contentAsset.findMany.mockResolvedValue([{ role: "ORIGINAL", scanStatus: "PENDING" }]);
    await expect(
      fan.recordDownload({ publicId: "item000000000095", device: DEVICE })
    ).rejects.toThrow("This item is not available.");
  });

  it("caps downloads per item per day", async () => {
    db.contentItem.findUnique.mockResolvedValue(item());
    limits.hits = 11;
    await expect(
      fan.recordDownload({ publicId: "item000000000094", device: DEVICE })
    ).rejects.toThrow("today's downloads");
  });

  it("says when the MP4 is not ready", async () => {
    db.contentItem.findUnique.mockResolvedValue(item());
    delivery.reason = "not_ready";
    await expect(
      fan.recordDownload({ publicId: "item000000000093", device: DEVICE })
    ).rejects.toThrow("not ready to download yet");
  });

  it("refuses a device id that could be a fingerprint", async () => {
    await expect(
      fan.recordDownload({ publicId: "item000000000092", device: "a b c" })
    ).rejects.toThrow();
  });

  it("waits on the fanLibrary flag", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: false });
    await expect(
      fan.recordDownload({ publicId: "item000000000091", device: DEVICE })
    ).rejects.toThrow("The Library is not available yet.");
  });
});

describe("markDownloaded and removeDownload", () => {
  it("only touch the fan's own records", async () => {
    const id = Buffer.alloc(16, 0xab);
    db.downloadRecord.findUnique.mockResolvedValue({ id, userId: 99, removedAt: null });
    await expect(fan.markDownloaded({ id: hex(id), bytes: 10 })).rejects.toThrow(
      "This download is not on this device."
    );
    db.downloadRecord.findUnique.mockResolvedValue({ id, userId: FAN, removedAt: null });
    await fan.markDownloaded({ id: hex(id), bytes: 1024 });
    expect(db.downloadRecord.update).toHaveBeenCalledWith({
      where: { id },
      data: { bytes: 1024n },
    });
    await fan.removeDownload({ id: hex(id) });
    expect(db.downloadRecord.update).toHaveBeenLastCalledWith({
      where: { id },
      data: { removedAt: expect.any(Date), removedReason: "removed" },
    });
  });

  it("removing twice writes once", async () => {
    const id = Buffer.alloc(16, 0xac);
    db.downloadRecord.findUnique.mockResolvedValue({ id, userId: FAN, removedAt: new Date() });
    await fan.removeDownload({ id: hex(id) });
    expect(db.downloadRecord.update).not.toHaveBeenCalled();
  });
});

describe("downloadsCheck", () => {
  function record(content: ReturnType<typeof item>, extra: Record<string, unknown> = {}) {
    seq += 1;
    return {
      id: Buffer.alloc(16, 0x40 + seq),
      userId: FAN,
      device: DEVICE,
      removedAt: null,
      removedReason: null,
      contentItem: content,
      ...extra,
    };
  }

  it("keeps allowed copies and closes the rest with a reason", async () => {
    const ok = record(item());
    const lost = record(item({ accessRuleId: Buffer.alloc(16, 2) }));
    const gone = record(item({ publishState: "UNPUBLISHED" }));
    const off = record(item({ allowDownload: false }));
    const removed = record(item(), { removedAt: new Date(), removedReason: "removed" });
    const other = record(item(), { userId: 99 });
    db.downloadRecord.findMany.mockResolvedValue([ok, lost, gone, off, removed, other]);
    const result = await fan.downloadsCheck({
      device: DEVICE,
      ids: [ok, lost, gone, off, removed, other].map(r => hex(r.id)).concat("f".repeat(32)),
    });
    expect(result.allowed).toEqual([hex(ok.id)]);
    expect(Object.fromEntries(result.removed.map(r => [r.id, r.reason]))).toEqual({
      [hex(lost.id)]: "access",
      [hex(gone.id)]: "unavailable",
      [hex(off.id)]: "downloadsOff",
      [hex(removed.id)]: "removed",
      [hex(other.id)]: "unavailable",
      ["f".repeat(32)]: "unavailable",
    });
    // Closed in one write per reason, never touching another fan's row
    expect(db.downloadRecord.updateMany).toHaveBeenCalledTimes(3);
    const closed = db.downloadRecord.updateMany.mock.calls.flatMap(([arg]) =>
      arg.where.id.in.map(hex)
    );
    expect(closed.sort()).toEqual([lost, gone, off].map(r => hex(r.id)).sort());
    expect(result.checkedAt).toMatch(/^\d{4}-/);
  });

  it("keeps a gated copy the fan can still open and closes it when access ends", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: true });
    const kept = record(item({ accessRuleId: Buffer.alloc(16, 3) }));
    db.downloadRecord.findMany.mockResolvedValue([kept]);
    engine.allowed = true;
    let result = await fan.downloadsCheck({ device: DEVICE, ids: [hex(kept.id)] });
    expect(result.allowed).toEqual([hex(kept.id)]);
    expect(db.downloadRecord.updateMany).not.toHaveBeenCalled();

    engine.allowed = false;
    result = await fan.downloadsCheck({ device: DEVICE, ids: [hex(kept.id)] });
    expect(result.removed).toEqual([{ id: hex(kept.id), reason: "access" }]);
  });

  it("a copy kept on another device is not this app's", async () => {
    const elsewhere = record(item(), { device: "dev_zzzzzzzzzzzzzzzz" });
    db.downloadRecord.findMany.mockResolvedValue([elsewhere]);
    const result = await fan.downloadsCheck({ device: DEVICE, ids: [hex(elsewhere.id)] });
    expect(result.allowed).toEqual([]);
  });
});

describe("downloads", () => {
  it("lists this app's copies with the item as the Library shows it", async () => {
    const video = item();
    db.downloadRecord.findMany.mockResolvedValue([
      {
        id: Buffer.alloc(16, 0x77),
        bytes: 2048n,
        createdAt: new Date("2026-11-05T10:00:00Z"),
        contentItem: video,
      },
    ]);
    const { items } = await fan.downloads({ device: DEVICE });
    expect(items).toEqual([
      expect.objectContaining({
        id: "77".repeat(16),
        bytes: 2048,
        item: expect.objectContaining({ publicId: video.publicId }),
      }),
    ]);
    expect(db.downloadRecord.findMany.mock.calls[0]![0].where).toEqual({
      userId: FAN,
      device: DEVICE,
      removedAt: null,
    });
  });
});
