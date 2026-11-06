/**
 * Nightly access jobs (G6): the leak scan over real gated rows and the 25 month event
 * purge. The database and the public builders are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  blocks: [] as Array<Record<string, unknown>>,
  items: [] as Array<{ publicId: string; userId: number }>,
  publicBlocks: new Map<number, Record<string, unknown> | null>(),
  cards: {} as Record<string, Record<string, unknown>>,
  sitemap: [] as Array<{ publicId: string }>,
  saved: null as null | string,
  events: [] as Array<{ id: number; createdAt: Date }>,
  deletes: 0,
  flag: true,
}));

vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));
vi.mock("../services/featureFlags", () => ({ isFeatureOn: () => state.flag }));
vi.mock("../services/access/blocks", () => ({
  publicBlocksFor: vi.fn(async (blocks: Array<{ id: number }>) =>
    blocks
      .map(block => (state.publicBlocks.has(block.id) ? state.publicBlocks.get(block.id) : block))
      .filter(Boolean)
  ),
}));
vi.mock("../services/content/publicView", () => ({
  publicCardsFor: vi.fn(async () => state.cards),
  contentSitemapEntries: vi.fn(async (page: number) => (page === 0 ? state.sitemap : [])),
}));
vi.mock("@repo/database", () => ({
  prisma: {
    block: { findMany: vi.fn(async () => state.blocks) },
    contentItem: { findMany: vi.fn(async () => state.items) },
    siteSettings: {
      upsert: vi.fn(async ({ update }: { update: { setting_value: string } }) => {
        state.saved = update.setting_value;
      }),
    },
    accessEvent: {
      findMany: vi.fn(
        async ({ where, take }: { where: { createdAt: { lt: Date } }; take: number }) =>
          state.events.filter(e => e.createdAt < where.createdAt.lt).slice(0, take)
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) => {
        const ids = new Set(where.id.in);
        const before = state.events.length;
        state.events = state.events.filter(e => !ids.has(e.id));
        state.deletes += 1;
        return { count: before - state.events.length };
      }),
    },
  },
}));

import {
  __resetAccessNightlyForTests,
  purgeAccessEvents,
  runAccessNightly,
  scanLeaks,
} from "../services/access/nightly";

const SECRET = "https://secret.example.com/vip-room";
const now = new Date("2026-11-05T04:00:00Z");
const gatedLink = (id: number) => ({
  id,
  user_id: 10,
  type: "link",
  config: { url: SECRET, label: "VIP room", platform: "custom" },
  accessRuleId: Buffer.alloc(16, 1),
});
const locked = (id: number) => ({
  id,
  type: "link",
  gated: true,
  config: { label: "VIP room", platform: "locked" },
});

beforeEach(() => {
  state.blocks = [];
  state.items = [];
  state.publicBlocks = new Map();
  state.cards = {};
  state.sitemap = [];
  state.saved = null;
  state.events = [];
  state.deletes = 0;
  state.flag = true;
  __resetAccessNightlyForTests();
});

describe("scanLeaks", () => {
  it("is clean when every gated block and item leaves locked, and saves the report", async () => {
    state.blocks = [gatedLink(1)];
    state.publicBlocks.set(1, locked(1));
    state.items = [{ publicId: "abc123", userId: 10 }];
    state.cards = { abc123: { publicId: "abc123", cover: null, gate: { kind: "follower" } } };
    state.sitemap = [{ publicId: "open01" }];
    const report = await scanLeaks(now);
    expect(report).toMatchObject({ blocks: 1, items: 1, sitemapEntries: 1, leaks: [] });
    expect(JSON.parse(state.saved!)).toMatchObject({ leaks: [], ranAt: now.toISOString() });
  });

  it("flags a gated block that leaves unlocked or carries its URL", async () => {
    state.blocks = [gatedLink(1), gatedLink(2)];
    state.publicBlocks.set(1, { id: 1, type: "link", config: { url: SECRET } });
    state.publicBlocks.set(2, { ...locked(2), config: { label: SECRET, platform: "locked" } });
    const report = await scanLeaks(now);
    expect(report.leaks).toEqual([
      { resource: "block:1", check: "block_unlocked" },
      { resource: "block:2", check: "block_config" },
    ]);
  });

  it("does not count a gated block left off the page", async () => {
    state.blocks = [gatedLink(1)];
    state.publicBlocks.set(1, null);
    expect((await scanLeaks(now)).leaks).toEqual([]);
  });

  it("flags a gated item with no gate, with a cover, or in the sitemap", async () => {
    state.items = [
      { publicId: "nogate", userId: 10 },
      { publicId: "cover1", userId: 10 },
      { publicId: "listed", userId: 11 },
    ];
    state.cards = {
      nogate: { publicId: "nogate", cover: null, gate: null },
      cover1: { publicId: "cover1", cover: { src: "x" }, gate: { kind: "follower" } },
    };
    state.sitemap = [{ publicId: "listed" }, { publicId: "open01" }];
    const report = await scanLeaks(now);
    expect(report.leaks).toEqual([
      { resource: "content:nogate", check: "content_unlocked" },
      { resource: "content:cover1", check: "content_cover" },
      { resource: "content:listed", check: "sitemap" },
    ]);
  });

  it("names resources only, never a fan", async () => {
    state.blocks = [gatedLink(1)];
    state.publicBlocks.set(1, { id: 1, type: "link", config: { url: SECRET } });
    await scanLeaks(now);
    expect(state.saved).not.toContain(SECRET);
    expect(state.saved).not.toMatch(/viewer|userId|user_id/);
  });
});

describe("purgeAccessEvents", () => {
  it("deletes events older than 25 months and keeps the rest", async () => {
    state.events = [
      { id: 1, createdAt: new Date("2024-09-01T00:00:00Z") },
      { id: 2, createdAt: new Date("2024-10-20T00:00:00Z") },
      { id: 3, createdAt: new Date("2026-11-01T00:00:00Z") },
    ];
    expect(await purgeAccessEvents(now)).toBe(1);
    expect(state.events.map(e => e.id)).toEqual([2, 3]);
  });
});

describe("runAccessNightly", () => {
  it("waits for 03:00 UTC, then runs once per day", async () => {
    expect(await runAccessNightly(new Date("2026-11-05T02:59:00Z"))).toBeNull();
    expect(await runAccessNightly(now)).toMatchObject({ purged: 0, report: { leaks: [] } });
    expect(await runAccessNightly(new Date("2026-11-05T05:00:00Z"))).toBeNull();
    expect(await runAccessNightly(new Date("2026-11-06T03:10:00Z"))).not.toBeNull();
  });

  it("checks accessGating on every tick: no scan while off, but retention still runs", async () => {
    state.events = [{ id: 1, createdAt: new Date("2024-01-01T00:00:00Z") }];
    state.flag = false;
    expect(await runAccessNightly(now)).toEqual({ purged: 1, report: null });
    expect(state.saved).toBeNull();
    // Still off later the same day: nothing new runs
    expect(await runAccessNightly(new Date("2026-11-05T06:00:00Z"))).toBeNull();
    // Gating turns on later the same day: the scan still runs on that tick
    state.flag = true;
    expect(await runAccessNightly(new Date("2026-11-05T10:00:00Z"))).toMatchObject({
      purged: 0,
      report: { leaks: [] },
    });
    // On the next day both jobs run again
    expect(await runAccessNightly(new Date("2026-11-06T03:10:00Z"))).toMatchObject({
      report: { leaks: [] },
    });
  });
});
