/**
 * Fan Library API (Build Board #26, FL-2, spec 3.4 and 3.6). The rules that
 * matter: the Library lists only what the fan can open now, and says how;
 * a fan can not save what they can not open; the section records a visit only
 * for a connected fan; Shop is empty until gating; everything waits on the
 * fanLibrary flag. The database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), findMany: fn() },
    theme: { findMany: fn() },
    follow: { findMany: fn(), findUnique: fn() },
    contentItem: { findMany: fn(), findUnique: fn(), findFirst: fn(), count: fn() },
    viewerProgress: { findMany: fn() },
    savedItem: { findMany: fn(), findUnique: fn(), upsert: fn(), deleteMany: fn() },
    libraryCreatorVisit: { findMany: fn(), upsert: fn() },
  };
});
const limits = vi.hoisted(() => ({ hits: 1 }));

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => limits.hits) }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../services/follow/poolFans", () => ({
  batchPoolFanCreatorIds: vi.fn(async () => new Set<number>()),
}));
vi.mock("../services/content/publicView", () => ({
  cardsForItems: vi.fn(async (items: Array<{ publicId: string; title: string }>) => {
    return new Map(
      items.map(item => [
        item.publicId,
        {
          publicId: item.publicId,
          kind: "video",
          title: item.title,
          durationMs: 760_000,
          pageCount: null,
          publishedAt: null,
          cover: null,
          blur: null,
          allowDownload: false,
        },
      ])
    );
  }),
}));

import { libraryRouter } from "../trpc/library";
import { libraryAccess } from "../services/library/access";
import { groupByOwner } from "../services/library/library";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";

const FAN = 7;
const MAYA = 3;
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

beforeEach(() => {
  vi.clearAllMocks();
  limits.hits = 1;
  __setFeatureFlagOverridesForTests({ fanLibrary: true });
  db.user.findMany.mockResolvedValue([mayaUser]);
  db.user.findFirst.mockResolvedValue(mayaUser);
  db.theme.findMany.mockResolvedValue([]);
  db.viewerProgress.findMany.mockResolvedValue([]);
  db.savedItem.findMany.mockResolvedValue([]);
  db.libraryCreatorVisit.findMany.mockResolvedValue([]);
});

describe("who may see an item (spec 3.4)", () => {
  it("lists public items as Public, and nothing else before gating", () => {
    expect(libraryAccess(item(), publicCreator, FAN)).toEqual({
      source: "public",
      planName: null,
    });
    expect(libraryAccess(item({ accessRuleId: Buffer.alloc(16) }), publicCreator, FAN)).toBeNull();
    expect(libraryAccess(item({ adult: true }), publicCreator, FAN)).toBeNull();
    expect(libraryAccess(item({ publishState: "DRAFT" }), publicCreator, FAN)).toBeNull();
    expect(libraryAccess(item(), { page_status: "PUBLISHED", block: "yes" }, FAN)).toBeNull();
  });

  it("leaves a creator's own items out of their fan Library", () => {
    expect(libraryAccess(item({ userId: FAN }), publicCreator, FAN)).toBeNull();
  });
});

describe("the fanLibrary flag and the limit", () => {
  it("refuses every procedure while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: false });
    await expect(fan.continue()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(fan.save({ publicId: "item000000000001" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(db.contentItem.findUnique).not.toHaveBeenCalled();
  });

  it("refuses past the per account limit", async () => {
    limits.hits = 121;
    await expect(fan.newest()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("newest and search", () => {
  it("lists newest from followed creators with owner and Public on every item", async () => {
    db.follow.findMany.mockResolvedValue([{ creator_id: MAYA }]);
    const rows = [item(), item({ title: "Harbor at 5 a.m." })];
    db.contentItem.findMany.mockResolvedValue(rows);
    const page = await fan.newest();
    expect(page.items.map(i => i.title)).toEqual([rows[0]!.title, "Harbor at 5 a.m."]);
    expect(page.items[0]).toMatchObject({
      accessSource: "public",
      owner: { handle: "maya", name: "Maya Lin" },
      planName: null,
    });
    expect(JSON.stringify(page)).not.toMatch(/email|wallet/i);
    const where = db.contentItem.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: { in: [MAYA] }, accessRuleId: null, adult: false });
  });

  it("answers an empty list for sources that need gating, without a query", async () => {
    await expect(fan.newest({ source: "member" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });

  it("drops items the access rule refuses even when the query returned them", async () => {
    db.follow.findMany.mockResolvedValue([{ creator_id: MAYA }]);
    db.contentItem.findMany.mockResolvedValue([item(), item({ adult: true })]);
    const page = await fan.newest();
    expect(page.items).toHaveLength(1);
  });

  it("searches only creators the fan follows, grouped by creator", async () => {
    db.follow.findMany.mockResolvedValue([]);
    await expect(fan.search({ q: "tide", scope: "creator", handle: "maya" })).resolves.toEqual({
      groups: [],
      nextCursor: null,
    });
    expect(db.contentItem.findMany).not.toHaveBeenCalled();
  });

  it("keeps groups in the order each creator first appears", () => {
    const owner = (handle: string) => ({ handle, name: null, image: null, accent: null });
    const groups = groupByOwner([
      { owner: owner("maya"), title: "a" },
      { owner: owner("theo"), title: "b" },
      { owner: owner("maya"), title: "c" },
    ] as never);
    expect(groups.map(g => [g.owner.handle, g.items.length])).toEqual([
      ["maya", 2],
      ["theo", 1],
    ]);
  });
});

describe("continue", () => {
  it("keeps unfinished items between 30 seconds and 95 percent", async () => {
    const playing = item({ title: "Playing" });
    const barely = item({ title: "Barely started" });
    const done = item({ title: "Nearly done" });
    const progress = (row: ReturnType<typeof item>, positionMs: number) => ({
      contentItemId: row.id,
      positionMs,
      durationMs: 760_000,
      completed: false,
      contentItem: row,
    });
    db.viewerProgress.findMany.mockResolvedValueOnce([
      progress(playing, 492_000),
      progress(barely, 10_000),
      progress(done, 740_000),
    ]);
    const { items } = await fan.continue();
    expect(items.map(i => i.title)).toEqual(["Playing"]);
  });
});

describe("creator section", () => {
  it("records the visit and counts Yours for a connected fan", async () => {
    db.follow.findUnique.mockResolvedValue({ show_publicly: true, email_updates: false });
    db.contentItem.count.mockResolvedValue(9);
    const header = await fan.creator({ handle: "@Maya" });
    expect(header).toMatchObject({
      connected: true,
      owner: { handle: "maya" },
      status: { membership: null, follow: { showPublicly: true, emailUpdates: false } },
      counts: { yours: 9, shop: 0 },
    });
    expect(db.libraryCreatorVisit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_creatorId: { userId: FAN, creatorId: MAYA } } })
    );
  });

  it("says not connected, and records nothing, for a creator the fan does not follow", async () => {
    db.follow.findUnique.mockResolvedValue(null);
    db.contentItem.count.mockResolvedValue(9);
    const header = await fan.creator({ handle: "maya" });
    expect(header).toMatchObject({ connected: false, counts: { yours: 0, shop: 0 } });
    expect(db.libraryCreatorVisit.upsert).not.toHaveBeenCalled();
  });

  it("is not found when the creator's page is not public", async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(fan.creator({ handle: "maya" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns an empty Shop until gating ships, and no media", async () => {
    db.follow.findUnique.mockResolvedValue({ id: 1 });
    await expect(fan.creatorItems({ handle: "maya", seg: "shop" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(db.contentItem.findMany).not.toHaveBeenCalled();
  });
});

describe("saved", () => {
  it("saves an item the fan can open, once", async () => {
    const row = item();
    db.contentItem.findUnique.mockResolvedValue(row);
    await expect(fan.save({ publicId: row.publicId })).resolves.toEqual({ saved: true });
    const call = db.savedItem.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_contentItemId: { userId: FAN, contentItemId: row.id } });
    expect(call.update).toEqual({});
  });

  it("refuses to save an item the fan can not open, as not found", async () => {
    db.contentItem.findUnique.mockResolvedValue(item({ accessRuleId: Buffer.alloc(16, 9) }));
    await expect(fan.save({ publicId: "item000000000099" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.savedItem.upsert).not.toHaveBeenCalled();
  });

  it("unsaves without minding a missing item", async () => {
    db.contentItem.findUnique.mockResolvedValue(null);
    await expect(fan.unsave({ publicId: "item000000000098" })).resolves.toEqual({ saved: false });
    expect(db.savedItem.deleteMany).not.toHaveBeenCalled();
  });

  it("hides saved items the fan lost access to", async () => {
    const open = item({ title: "Still open" });
    const gated = item({ title: "Now gated", accessRuleId: Buffer.alloc(16, 4) });
    db.savedItem.findMany.mockResolvedValueOnce([
      { id: Buffer.alloc(16, 1), contentItem: open },
      { id: Buffer.alloc(16, 2), contentItem: gated },
    ]);
    const page = await fan.saved();
    expect(page.items.map(i => i.title)).toEqual(["Still open"]);
  });
});
