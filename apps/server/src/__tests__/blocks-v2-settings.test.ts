/**
 * Block Review v2 B0 (Build Board #54): Block settings on the server.
 * - The leak test: a hidden, expired or not yet live block's URL and text never
 *   leave getHandle, and a countdown row carries the label and start only.
 * - The settings save only while blocksV2 is on.
 * - One block per page asks for attention (BS2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db: Record<string, any> = {
    user: { findFirst: fn() },
    creatorPool: { findFirst: fn() },
    theme: { findUnique: fn() },
    block: { findMany: fn(), findUnique: fn(), findFirst: fn(), create: fn(), update: fn() },
    $transaction: fn(),
  };
  return db;
});

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../trpc/trackingPixels", () => ({ getPublicTrackingPixels: vi.fn(async () => null) }));
vi.mock("../services/rnsIdentity", () => ({
  computeRnsIdentity: vi.fn(async () => ({ identity: null })),
  parseRnsDisplay: vi.fn(() => ({})),
  rnsIdBlockOptions: vi.fn(() => ({ attributes: [], visible: false })),
}));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import handleRouter from "../trpc/handle";
import { blocksRouter } from "../trpc/blocks";
import { visibleBlockRows } from "../services/blocks/visibility";

const OWNER_ID = 42;
const LISBON = "Europe/Lisbon";
const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function row(id: number, order: number, config: Record<string, unknown>, type = "link") {
  return {
    id,
    user_id: OWNER_ID,
    type,
    order,
    clicks: 0,
    accessRuleId: null,
    config,
    created_at: new Date("2026-10-01T00:00:00Z"),
    updated_at: null,
  };
}

const ROWS = [
  row(1, 0, { platform: "custom", url: "https://public.example/live", label: "Live link" }),
  row(2, 1, {
    platform: "custom",
    url: "https://secret.example/hidden",
    label: "Hidden link",
    hidden: true,
  }),
  row(3, 2, {
    platform: "custom",
    url: "https://secret.example/expired",
    label: "Expired link",
    schedule: { start: iso(-3 * DAY), end: iso(-DAY), zone: LISBON, showCountdown: false },
  }),
  row(4, 3, {
    platform: "custom",
    url: "https://secret.example/upcoming",
    label: "Upcoming link",
    schedule: { start: iso(2 * DAY), zone: LISBON, showCountdown: false },
  }),
  row(5, 4, {
    platform: "custom",
    url: "https://secret.example/countdown",
    label: "Kiln sale preview",
    schedule: { start: iso(11 * DAY), zone: LISBON, showCountdown: true },
  }),
  row(6, 5, { content: "<p>secret words before go live</p>", platform: "text", schedule: { start: iso(DAY), zone: LISBON, showCountdown: true } }, "text"),
];

function publishedUser() {
  return {
    id: OWNER_ID,
    handle: "maravale",
    name: "Mara Vale",
    revo_name: null,
    rns_display: null,
    description: null,
    image: null,
    image_file_id: null,
    theme: 1,
    page_status: "PUBLISHED",
    block: "no",
    wallet: null,
    created_at: new Date("2026-03-14T10:00:00Z"),
  };
}

describe("getHandle leak test (Block settings server rule)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findFirst.mockResolvedValue(publishedUser());
    db.theme.findUnique.mockResolvedValue({ id: 1, name: "Default", config: null });
    db.block.findMany.mockResolvedValue(ROWS);
  });

  for (const viewer of [undefined, OWNER_ID + 1, OWNER_ID]) {
    it(`keeps hidden, expired and upcoming blocks out for viewer ${viewer ?? "signed out"}`, async () => {
      const caller = handleRouter.createCaller({ user: viewer ? { sub: viewer } : undefined } as never);
      const result = await caller.getHandle({ handle: "maravale" });
      const body = JSON.stringify(result);
      expect(body).not.toContain("secret.example");
      expect(body).not.toContain("secret words");
      expect(body).not.toContain("Hidden link");
      expect(body).not.toContain("Expired link");
      expect(body).not.toContain("Upcoming link");
      expect(body).toContain("https://public.example/live");

      const blocks = result.blocks as Array<Record<string, any>>;
      expect(blocks.map(block => block.id)).toEqual([1, 5]);
      expect(blocks[1]).toEqual({
        id: 5,
        type: "link",
        order: 4,
        config: { label: "Kiln sale preview" },
        scheduled: { start: ROWS[4]!.config.schedule!.start },
      });
    });
  }

  it("does not count countdown rows as indexable content", () => {
    const { shown, countdowns } = visibleBlockRows(ROWS);
    expect(shown.map(block => block.id)).toEqual([1]);
    // The text block has no label, so it waits for go live with no countdown row
    expect(countdowns.map(block => block.id)).toEqual([5]);
  });

  it("shows a block once its go live has passed", () => {
    const later = new Date(Date.now() + 12 * DAY);
    const { shown } = visibleBlockRows(ROWS, later);
    expect(shown.map(block => block.id)).toEqual([1, 4, 5, 6]);
  });
});

describe("Block settings on save", () => {
  const caller = blocksRouter.createCaller({ user: { sub: OWNER_ID } } as never);
  const settings = {
    schedule: { start: "2026-11-06T20:00:00.000Z", zone: LISBON, showCountdown: true },
    attention: { preset: "glow" },
    motion: { entrance: true, style: "rise" },
  };
  const link = { platform: "custom", url: "https://maravale.shop/kiln", label: "Kiln sale" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) => run(db));
    db.block.findUnique.mockResolvedValue({ id: 1, user_id: OWNER_ID });
    db.block.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
    db.block.create.mockImplementation(async ({ data }: any) => ({ id: 99, ...data }));
    db.block.findMany.mockResolvedValue([]);
  });

  afterEach(() => __setFeatureFlagOverridesForTests({}));

  it("drops the settings while blocksV2 is off", async () => {
    __setFeatureFlagOverridesForTests({ blocksV2: false });
    await caller.editBlock({ id: 1, type: "link", order: 0, config: { ...link, ...settings } });
    const saved = db.block.update.mock.calls[0]![0].data.config;
    expect(saved).toEqual(link);
  });

  it("keeps the settings while blocksV2 is on", async () => {
    __setFeatureFlagOverridesForTests({ blocksV2: true });
    await caller.editBlock({ id: 1, type: "link", order: 0, config: { ...link, ...settings } });
    const saved = db.block.update.mock.calls[0]![0].data.config;
    expect(saved).toMatchObject(settings);
  });

  it("moves attention: the other block loses it in the same save", async () => {
    __setFeatureFlagOverridesForTests({ blocksV2: true });
    db.block.findMany.mockResolvedValue([
      { id: 2, config: { label: "Old", attention: { preset: "shimmer" } } },
      { id: 3, config: { label: "Quiet" } },
    ]);
    await caller.editBlock({ id: 1, type: "link", order: 0, config: { ...link, ...settings } });
    const updates = db.block.update.mock.calls.map(([args]: any) => args);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ where: { id: 2 }, data: { config: { label: "Old" } } });
  });

  it("refuses a page save that asks two blocks for attention", async () => {
    __setFeatureFlagOverridesForTests({ blocksV2: true });
    await expect(
      caller.editBlocks({
        blocks: [
          { id: 1, type: "link", order: 0, config: { ...link, attention: { preset: "glow" } } },
          { id: 2, type: "link", order: 1, config: { ...link, attention: { preset: "pop" } } },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only one block can ask for attention" });
    expect(db.block.update).not.toHaveBeenCalled();
  });
});
