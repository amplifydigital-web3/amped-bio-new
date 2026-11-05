/**
 * Fan Library gated items (Build Board #26, FL-6, spec 3.4). The rules that
 * matter: with accessGating on, a gated item the fan passes is listed with the
 * source that opened it; an item the fan can unlock from the Library goes to
 * the Shop as a locked card with its next step and no media; anything else is
 * left out. Public items never reach the engine, and Library reads are not
 * recorded as locked views. The engine and the database are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessDecision } from "@repo/constants";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), findMany: fn() },
    theme: { findMany: fn() },
    follow: { findMany: fn(), findUnique: fn() },
    contentItem: { findMany: fn(), findUnique: fn(), findFirst: fn(), count: fn() },
    viewerProgress: { findMany: fn(), upsert: fn(), deleteMany: fn() },
    savedItem: { findMany: fn(), findUnique: fn(), upsert: fn(), deleteMany: fn() },
    libraryCreatorVisit: { findMany: fn(), upsert: fn() },
    accessRule: { findMany: fn() },
    stakedPool: { findMany: fn() },
  };
});
const engine = vi.hoisted(() => ({ checkBatch: vi.fn() }));
const poolFans = vi.hoisted(() => ({ set: new Set<number>() }));

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => 1) }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../services/access/engine", () => engine);
vi.mock("../services/follow/poolFans", () => ({
  batchPoolFanCreatorIds: vi.fn(async () => poolFans.set),
}));
vi.mock("../services/content/publicView", () => {
  const card = (item: { publicId: string; title: string }, locked: boolean) => ({
    publicId: item.publicId,
    kind: "video",
    title: item.title,
    durationMs: 760_000,
    pageCount: null,
    publishedAt: null,
    cover: locked ? null : { src: "https://cdn/cover.jpg" },
    blur: locked ? "https://cdn/blur.jpg" : null,
    allowDownload: false,
    ...(locked ? { gate: { kind: "pool_member", summary: "Pool fans", stake: true } } : {}),
  });
  return {
    cardsForItems: vi.fn(async (items: Array<{ publicId: string; title: string }>) => {
      return new Map(items.map(item => [item.publicId, card(item, false)]));
    }),
    lockedCardsForItems: vi.fn(async (items: Array<{ publicId: string; title: string }>) => {
      return new Map(items.map(item => [item.publicId, card(item, true)]));
    }),
  };
});

import { libraryRouter } from "../trpc/library";
import { libraryDecisions, shopHint } from "../services/library/access";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";

const FAN = 7;
const MAYA = 3;
const fan = libraryRouter.createCaller({ user: { sub: FAN, wallet: "0xfan" } } as never);
const viewer = { userId: FAN, wallet: "0xfan" };

const publicCreator = { page_status: "PUBLISHED", block: "no" };
const RULE_POOL = Buffer.alloc(16, 0xa1);
const RULE_FOLLOW = Buffer.alloc(16, 0xa2);
const RULE_ANY = Buffer.alloc(16, 0xa3);
const hex = (id: Buffer) => id.toString("hex");

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
    accessRuleId: null as Buffer | null,
    adult: false,
    deletedAt: null,
    user: publicCreator,
    ...extra,
  };
}

function decision(
  allowed: boolean,
  reason: AccessDecision["reason"],
  kind: string | null,
  hint: AccessDecision["hint"] = { action: "none" }
): AccessDecision {
  return {
    allowed,
    reason,
    hint,
    rule: kind ? { id: "r", kind: kind as never, summary: "" } : null,
    checkedAt: new Date(0).toISOString(),
  };
}

/** Engine answers keyed by publicId. */
function engineSays(answers: Record<string, AccessDecision>) {
  engine.checkBatch.mockImplementation(async (_viewer, resources: Array<{ id: string }>) => {
    return new Map(resources.map(r => [`content:${r.id}`, answers[r.id]!]));
  });
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
  poolFans.set = new Set();
  __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: true });
  db.user.findMany.mockResolvedValue([mayaUser]);
  db.user.findFirst.mockResolvedValue(mayaUser);
  db.theme.findMany.mockResolvedValue([]);
  db.viewerProgress.findMany.mockResolvedValue([]);
  db.savedItem.findMany.mockResolvedValue([]);
  db.libraryCreatorVisit.findMany.mockResolvedValue([]);
  db.accessRule.findMany.mockResolvedValue([]);
  db.stakedPool.findMany.mockResolvedValue([]);
});

describe("the Shop hint for a refusal (spec 3.4)", () => {
  it("sends stake refusals to the pool", () => {
    for (const reason of ["not_pool_member", "stake_below_min", "no_wallet"] as const) {
      expect(shopHint(decision(false, reason, "pool_member"))).toEqual({ kind: "pool" });
    }
  });

  it("asks to follow, or to confirm the email for a pending follow", () => {
    expect(
      shopHint(
        decision(false, "not_follower", "follower", { action: "follow", creatorHandle: "maya" })
      )
    ).toEqual({ kind: "follow" });
    expect(shopHint(decision(false, "follow_pending", "follower"))).toEqual({
      kind: "confirm_email",
    });
  });

  it("leaves out refusals the fan can not act on", () => {
    for (const reason of [
      "kind_unavailable",
      "blocked",
      "not_found",
      "age_check_required",
    ] as const) {
      expect(shopHint(decision(false, reason, null))).toBeNull();
    }
  });
});

describe("deciding a page (spec 3.4)", () => {
  it("never asks the engine about public items, or the fan's own", async () => {
    const open = item();
    const own = item({ userId: FAN, accessRuleId: RULE_POOL });
    engineSays({});
    const out = await libraryDecisions(viewer, [open, own]);
    expect(out.get(open.publicId)).toEqual({ open: { source: "public", planName: null } });
    expect(out.get(own.publicId)).toBeNull();
    expect(engine.checkBatch).not.toHaveBeenCalled();
  });

  it("leaves gated items out while accessGating is off", async () => {
    __setFeatureFlagOverridesForTests({ fanLibrary: true, accessGating: false });
    const gated = item({ accessRuleId: RULE_POOL });
    const out = await libraryDecisions(viewer, [gated]);
    expect(out.get(gated.publicId)).toBeNull();
    expect(engine.checkBatch).not.toHaveBeenCalled();
  });

  it("names the source from the rule, and does not record a locked view", async () => {
    const pool = item({ accessRuleId: RULE_POOL });
    const follower = item({ accessRuleId: RULE_FOLLOW });
    engineSays({
      [pool.publicId]: decision(true, "ok", "pool_member"),
      [follower.publicId]: decision(true, "ok", "follower"),
    });
    const out = await libraryDecisions(viewer, [pool, follower]);
    expect(out.get(pool.publicId)).toEqual({ open: { source: "pool", planName: null } });
    expect(out.get(follower.publicId)).toEqual({ open: { source: "follower", planName: null } });
    expect(engine.checkBatch).toHaveBeenCalledWith(viewer, expect.any(Array), {
      intent: "render",
      record: false,
    });
  });

  it("reads any() through the leaves the fan holds, pool before follower", async () => {
    const gated = item({ accessRuleId: RULE_ANY });
    engineSays({ [gated.publicId]: decision(true, "ok", "any") });
    db.accessRule.findMany
      .mockResolvedValueOnce([
        { id: RULE_ANY, params: { ruleIds: [hex(RULE_POOL), hex(RULE_FOLLOW)] } },
      ])
      .mockResolvedValueOnce([
        { id: RULE_POOL, kind: "pool_member" },
        { id: RULE_FOLLOW, kind: "follower" },
      ]);
    poolFans.set = new Set([MAYA]);
    expect((await libraryDecisions(viewer, [gated])).get(gated.publicId)).toEqual({
      open: { source: "pool", planName: null },
    });
  });

  it("reads any() as follower for a fan with no stake", async () => {
    const gated = item({ accessRuleId: RULE_ANY });
    engineSays({ [gated.publicId]: decision(true, "ok", "any") });
    db.accessRule.findMany
      .mockResolvedValueOnce([
        { id: RULE_ANY, params: { ruleIds: [hex(RULE_POOL), hex(RULE_FOLLOW)] } },
      ])
      .mockResolvedValueOnce([
        { id: RULE_POOL, kind: "pool_member" },
        { id: RULE_FOLLOW, kind: "follower" },
      ]);
    expect((await libraryDecisions(viewer, [gated])).get(gated.publicId)).toEqual({
      open: { source: "follower", planName: null },
    });
  });

  it("locks refusals with a next step and drops the rest", async () => {
    const stake = item({ accessRuleId: RULE_POOL });
    const unavailable = item({ accessRuleId: RULE_POOL });
    engineSays({
      [stake.publicId]: decision(false, "stake_below_min", "stake_min"),
      [unavailable.publicId]: decision(false, "kind_unavailable", "pool_member"),
    });
    const out = await libraryDecisions(viewer, [stake, unavailable]);
    expect(out.get(stake.publicId)).toEqual({ locked: { kind: "pool" } });
    expect(out.get(unavailable.publicId)).toBeNull();
  });

  it("never asks about an item that is not listed (18+, draft)", async () => {
    const adult = item({ accessRuleId: RULE_POOL, adult: true });
    const draft = item({ accessRuleId: RULE_POOL, publishState: "DRAFT" });
    engineSays({});
    const out = await libraryDecisions(viewer, [adult, draft]);
    expect(out.get(adult.publicId)).toBeNull();
    expect(out.get(draft.publicId)).toBeNull();
    expect(engine.checkBatch).not.toHaveBeenCalled();
  });
});

describe("lists through the router", () => {
  it("lists the items the fan opens, with their source, and leaves locked ones out", async () => {
    const open = item({ accessRuleId: RULE_FOLLOW });
    const locked = item({ accessRuleId: RULE_POOL });
    db.follow.findMany.mockResolvedValue([{ creator_id: MAYA }]);
    db.contentItem.findMany.mockResolvedValue([open, locked]);
    engineSays({
      [open.publicId]: decision(true, "ok", "follower"),
      [locked.publicId]: decision(false, "not_pool_member", "pool_member"),
    });
    const page = await fan.newest();
    expect(page.items.map(i => [i.publicId, i.accessSource])).toEqual([
      [open.publicId, "follower"],
    ]);
  });

  it("filters Newest by source", async () => {
    const pool = item({ accessRuleId: RULE_POOL });
    const follower = item({ accessRuleId: RULE_FOLLOW });
    db.follow.findMany.mockResolvedValue([{ creator_id: MAYA }]);
    db.contentItem.findMany.mockResolvedValue([pool, follower]);
    engineSays({
      [pool.publicId]: decision(true, "ok", "pool_member"),
      [follower.publicId]: decision(true, "ok", "follower"),
    });
    const page = await fan.newest({ source: "pool" });
    expect(page.items.map(i => i.publicId)).toEqual([pool.publicId]);
    expect(db.contentItem.findMany.mock.calls[0]![0].where.accessRuleId).toEqual({ not: null });
  });

  it("answers purchased and member as empty until FL-7, without a query", async () => {
    await expect(fan.newest({ source: "member" })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(db.contentItem.findMany).not.toHaveBeenCalled();
  });

  it("returns Shop items as locked cards with the next step and no media", async () => {
    const locked = item({ accessRuleId: RULE_POOL });
    const open = item({ accessRuleId: RULE_FOLLOW });
    db.follow.findUnique.mockResolvedValue({ show_publicly: false, email_updates: false });
    db.contentItem.findMany.mockResolvedValue([locked, open]);
    engineSays({
      [locked.publicId]: decision(false, "not_pool_member", "pool_member"),
      [open.publicId]: decision(true, "ok", "follower"),
    });
    const page = await fan.creatorItems({ handle: "maya", seg: "shop" });
    expect(page.items).toHaveLength(1);
    const shop = page.items[0]! as { publicId: string; unlockHint: unknown; cover: unknown };
    expect(shop.publicId).toBe(locked.publicId);
    expect(shop.unlockHint).toEqual({ kind: "pool" });
    expect(shop.cover).toBeNull();
    expect(db.contentItem.findMany.mock.calls[0]![0].where.accessRuleId).toEqual({ not: null });
  });

  it("opens the section for a pool fan who does not follow", async () => {
    db.follow.findUnique.mockResolvedValue(null);
    poolFans.set = new Set([MAYA]);
    db.contentItem.findMany.mockResolvedValue([]);
    const header = await fan.creator({ handle: "maya" });
    expect(header.connected).toBe(true);
    expect(header.connection.poolFan).toBe(true);
    expect(db.libraryCreatorVisit.upsert).toHaveBeenCalled();
  });

  it("counts Yours and Shop from the engine's answers", async () => {
    const open = item({ accessRuleId: RULE_FOLLOW });
    const locked = item({ accessRuleId: RULE_POOL });
    const hidden = item({ accessRuleId: RULE_POOL });
    const plain = item();
    db.follow.findUnique.mockResolvedValue({ show_publicly: false, email_updates: true });
    db.contentItem.findMany.mockResolvedValue([open, locked, hidden, plain]);
    engineSays({
      [open.publicId]: decision(true, "ok", "follower"),
      [locked.publicId]: decision(false, "not_pool_member", "pool_member"),
      [hidden.publicId]: decision(false, "kind_unavailable", "pool_member"),
    });
    const header = await fan.creator({ handle: "maya" });
    expect(header.counts).toEqual({ yours: 2, shop: 1 });
  });

  it("refuses to save an item the engine refuses", async () => {
    const locked = item({ accessRuleId: RULE_POOL });
    db.contentItem.findUnique.mockResolvedValue(locked);
    engineSays({ [locked.publicId]: decision(false, "not_pool_member", "pool_member") });
    await expect(fan.save({ publicId: locked.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.savedItem.upsert).not.toHaveBeenCalled();
  });

  it("saves a gated item the fan opens", async () => {
    const open = item({ accessRuleId: RULE_FOLLOW });
    db.contentItem.findUnique.mockResolvedValue(open);
    engineSays({ [open.publicId]: decision(true, "ok", "follower") });
    await expect(fan.save({ publicId: open.publicId })).resolves.toEqual({ saved: true });
  });
});
