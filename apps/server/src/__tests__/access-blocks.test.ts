/**
 * Access gating G3 (docs/features/access-gating-engine.md 3.7 and 3.9): gated
 * link, text and media blocks. The locked DTO on getHandle, blocks.get owner
 * only, blocks.setAccessRule with inline cleanup, access.openBlock,
 * access.checkPage for blocks, GET /go/:blockId, and the block part of the
 * leak test (acceptance 5). The database is an in memory fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { OWNER, FAN, POOL } = vi.hoisted(() => ({ OWNER: 7, FAN: 20, POOL: 5 }));

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const blocks: Row[] = [];
  const rules = new Map<string, Row>();
  const events: Row[] = [];
  const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
  const same = (a: any, b: any) =>
    a instanceof Uint8Array && b instanceof Uint8Array
      ? Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0
      : a === b;
  const test = (value: any, cond: any): boolean => {
    if (cond && typeof cond === "object" && !(cond instanceof Uint8Array)) {
      if ("in" in cond) return cond.in.some((v: any) => same(v, value));
      if ("not" in cond) return !same(value ?? null, cond.not);
    }
    return same(value ?? null, cond);
  };
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) =>
      key === "OR" ? (cond as Row[]).some(part => matches(row, part)) : test(row[key], cond)
    );
  const state = { follows: new Set<number>() };
  const user = {
    id: 7,
    handle: "maya",
    name: "Maya Lin",
    revo_name: null,
    rns_display: null,
    description: null,
    image: null,
    image_file_id: null,
    theme: 1,
    page_status: "PUBLISHED",
    block: "no",
    show_follower_count: false,
    wallet: null,
    created_at: new Date("2026-03-14T10:00:00Z"),
  };
  const prisma: any = {
    user: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.handle === "maya" || where.OR?.some((part: any) => part.handle === "maya")
          ? { ...user, id: OWNER }
          : null
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === OWNER
          ? { id: OWNER, handle: "maya", block: "no", page_status: "PUBLISHED" }
          : { id: where.id, block: "no" }
      ),
    },
    followBlock: { findUnique: vi.fn(async () => null) },
    theme: { findUnique: vi.fn(async () => ({ id: 1, name: "Default", config: null })) },
    creatorPool: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({ wallet: { userId: OWNER } })),
      findMany: vi.fn(async () => [{ id: POOL, poolAddress: "0xpool" }]),
    },
    block: {
      findMany: vi.fn(async ({ where }: any) => blocks.filter(row => matches(row, where))),
      findUnique: vi.fn(async ({ where, select }: any) => {
        const row = blocks.find(
          b => b.id === where.id && (where.user_id ?? b.user_id) === b.user_id
        );
        if (!row) return null;
        return select?.user ? { ...row, user: { handle: "maya" } } : { ...row };
      }),
      update: vi.fn(async ({ where, data }: any) =>
        Object.assign(blocks.find(b => b.id === where.id)!, data)
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = blocks.filter(b => matches(b, where));
        for (const row of rows) if (data.clicks?.increment) row.clicks += data.clicks.increment;
        return { count: rows.length };
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = blocks.findIndex(b => b.id === where.id);
        return blocks.splice(index, 1)[0];
      }),
      count: vi.fn(async ({ where }: any) => blocks.filter(row => matches(row, where)).length),
    },
    contentItem: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    accessRule: {
      create: vi.fn(async ({ data }: any) => {
        rules.set(hex(data.id), { ...data, opensToAllAt: null, version: 1 });
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = rules.get(hex(where.id));
        return row ? { ...row } : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        [...rules.values()].filter(row => matches(row, where)).map(row => ({ ...row }))
      ),
      delete: vi.fn(async ({ where }: any) => {
        rules.delete(hex(where.id));
      }),
    },
    accessEvent: { create: vi.fn(async ({ data }: any) => events.push(data)) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, blocks, rules, events, state, hex };
});

const limiter = vi.hoisted(() => ({ hits: new Map<string, number>() }));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Record<string, string> }) =>
        headers.cookie === "fan" ? { user: { id: String(FAN), wallet: "0xfan" } } : null
      ),
    },
  },
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../trpc/trackingPixels", () => ({ getPublicTrackingPixels: vi.fn(async () => null) }));
vi.mock("../services/rnsIdentity", () => ({
  computeRnsIdentity: vi.fn(async () => ({ identity: null })),
  parseRnsDisplay: vi.fn(() => ({})),
  rnsIdBlockOptions: vi.fn(() => ({ attributes: [], visible: false })),
}));
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    delete: vi.fn(async () => true),
  },
}));
vi.mock("../utils/rateLimit", async importOriginal => {
  const hitRateLimit = vi.fn(async (key: string) => {
    const next = (limiter.hits.get(key) ?? 0) + 1;
    limiter.hits.set(key, next);
    return next;
  });
  return {
    ...(await importOriginal<typeof import("../utils/rateLimit")>()),
    hitRateLimit,
    enforceRateLimits: async (rules: Array<{ key: string; limit: number }>, message: string) => {
      for (const rule of rules) {
        if ((await hitRateLimit(rule.key)) > rule.limit) {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
        }
      }
    },
  };
});
vi.mock("../services/analytics/requestContext", () => ({
  getClientIp: () => "203.0.113.9",
  getVisitorHash: () => "v".repeat(40),
}));
vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () => ({ pass: false, reason: "not_verified" })),
}));
vi.mock("../services/access/facts", () => ({
  followState: vi.fn(async (_owner: number, userId: number) =>
    db.state.follows.has(userId) ? "active" : "none"
  ),
  loadPool: vi.fn(async () => ({ id: POOL, ownerUserId: OWNER, chainId: "1", poolAddress: "0x" })),
  mirrorStakeWei: vi.fn(async () => 0n),
  chainStakeWei: vi.fn(async () => 0n),
}));

import { env } from "../env";
import handleRouter from "../trpc/handle";
import { blocksRouter } from "../trpc/blocks";
import { accessRouter } from "../trpc/access";
import { handleGo } from "../routes/go";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { clearEventDedupe } from "../services/access/engine";

const ctx = (sub: number | null) =>
  ({
    user: sub === null ? undefined : { sub, wallet: sub === FAN ? "0xfan" : null },
    req: { headers: { "user-agent": "UA" } },
  }) as never;

const SECRET_URL = "https://secret.example.com/vip-room";
const SECRET_TEXT = "<p>The door code is <strong>4417</strong></p>";
const SECRET_EMBED = "https://www.youtube.com/watch?v=hiddenvid01";

let ruleSeq = 0;
function addRule(kind: string, params: Record<string, unknown>, name: string | null = null) {
  ruleSeq += 1;
  const id = Buffer.alloc(16, ruleSeq);
  db.rules.set(db.hex(id), {
    id,
    ownerUserId: OWNER,
    kind,
    params,
    name,
    opensToAllAt: null,
    version: 1,
  });
  return id;
}

let blockSeq = 0;
function addBlock(
  type: string,
  config: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  blockSeq += 1;
  const row = {
    id: blockSeq,
    user_id: OWNER,
    type,
    order: blockSeq,
    clicks: 12,
    config,
    accessRuleId: null as Buffer | null,
    created_at: new Date(),
    updated_at: null,
    ...extra,
  };
  db.blocks.push(row);
  return row;
}

function gatedFixture() {
  const follower = addRule("follower", {});
  const link = addBlock(
    "link",
    { platform: "custom", url: SECRET_URL, label: "VIP room" },
    { accessRuleId: follower }
  );
  const text = addBlock(
    "text",
    { platform: "text", content: SECRET_TEXT },
    { accessRuleId: addRule("follower", {}) }
  );
  const media = addBlock(
    "media",
    { platform: "youtube", url: SECRET_EMBED, label: "Behind the scenes" },
    { accessRuleId: addRule("stake_min", { poolId: POOL, minWei: "500000000000000000000" }) }
  );
  const open = addBlock("link", {
    platform: "instagram",
    url: "https://instagram.com/maya",
    label: "IG",
  });
  return { link, text, media, open };
}

function fakeRes() {
  const res: any = { headers: {} as Record<string, string>, statusCode: 200, body: "" };
  res.setHeader = (k: string, v: string) => (res.headers[k] = v);
  res.status = (code: number) => ((res.statusCode = code), res);
  res.type = () => res;
  res.send = (body: string) => ((res.body = body), res);
  res.redirect = (code: number, url: string) => (
    (res.statusCode = code), (res.location = url), res
  );
  return res;
}
const goReq = (blockId: string | number, cookie?: string) =>
  ({
    params: { blockId: String(blockId) },
    headers: { "user-agent": "UA", ...(cookie ? { cookie } : {}) },
  }) as never;

beforeEach(() => {
  db.blocks.length = 0;
  db.rules.clear();
  db.events.length = 0;
  db.state.follows.clear();
  limiter.hits.clear();
  clearEventDedupe();
  __setFeatureFlagOverridesForTests({ accessGating: true });
  Object.assign(env, {
    ACCESS_STAKE_KINDS_ALLOWLIST: String(OWNER),
    LANDINGPAGE_URL: "https://amped.test",
  });
});

describe("leak test, block part (acceptance 5)", () => {
  it("sends gated blocks as the locked DTO on getHandle, signed out", async () => {
    const { link, text, media, open } = gatedFixture();
    const page = await handleRouter.createCaller(ctx(null)).getHandle({ handle: "maya" });
    const json = JSON.stringify(page);
    for (const secret of [
      SECRET_URL,
      "secret.example.com",
      "4417",
      "door code",
      SECRET_EMBED,
      "hiddenvid01",
      "500000000000000000000",
    ]) {
      expect(json).not.toContain(secret);
    }
    const byId = new Map(page.blocks.map(block => [block.id, block as any]));
    expect(byId.get(link.id)).toMatchObject({
      gated: true,
      clicks: 0,
      config: { label: "VIP room", platform: "locked" },
      gate: { kind: "follower", summary: "Followers", stake: false },
    });
    expect(byId.get(text.id)!.config).toEqual({ label: "", platform: "text" });
    expect(byId.get(media.id)).toMatchObject({
      config: { label: "Behind the scenes", platform: "youtube" },
      gate: { kind: "stake_min", stake: true, poolAddress: "0xpool" },
    });
    expect(byId.get(open.id)!.config.url).toBe("https://instagram.com/maya");
    expect(byId.get(open.id)!.gated).toBeUndefined();
  });

  it("leaves gated blocks off the page while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ accessGating: false });
    const { open } = gatedFixture();
    const page = await handleRouter.createCaller(ctx(null)).getHandle({ handle: "maya" });
    expect(page.blocks.map(block => block.id)).toEqual([open.id]);
    expect(JSON.stringify(page)).not.toContain(SECRET_URL);
  });

  it("does not show a hidden gated block at all", async () => {
    addBlock(
      "link",
      { platform: "custom", url: SECRET_URL, label: "Hidden", hidden: true },
      { accessRuleId: addRule("follower", {}) }
    );
    const page = await handleRouter.createCaller(ctx(null)).getHandle({ handle: "maya" });
    expect(page.blocks).toHaveLength(0);
  });
});

describe("blocks router (G3)", () => {
  it("blocks.get answers only the owner", async () => {
    const { link } = gatedFixture();
    await expect(blocksRouter.createCaller(ctx(FAN)).get({ id: link.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const own = await blocksRouter.createCaller(ctx(OWNER)).get({ id: link.id });
    expect(own.result).toMatchObject({ gated: true, config: { url: SECRET_URL } });
    expect(own.result).not.toHaveProperty("accessRuleId");
  });

  it("getAll marks gated rows and drops the raw rule id", async () => {
    gatedFixture();
    const { result } = await blocksRouter.createCaller(ctx(OWNER)).getAll();
    expect(result.map(row => row.gated)).toEqual([true, true, true, false]);
    expect(result.every(row => !("accessRuleId" in row))).toBe(true);
  });

  it("setAccessRule writes an inline rule and cleans it up when cleared", async () => {
    const block = addBlock("link", { platform: "custom", url: SECRET_URL, label: "VIP" });
    await blocksRouter
      .createCaller(ctx(OWNER))
      .setAccessRule({ blockId: block.id, access: { kind: "follower", params: {} } });
    expect(block.accessRuleId).not.toBeNull();
    expect(db.rules.size).toBe(1);
    await blocksRouter.createCaller(ctx(OWNER)).setAccessRule({ blockId: block.id, access: null });
    expect(block.accessRuleId).toBeNull();
    expect(db.rules.size).toBe(0);
  });

  it("setAccessRule refuses: flag off, another owner, a non lockable block, stake outside the allowlist", async () => {
    const link = addBlock("link", { platform: "custom", url: SECRET_URL, label: "VIP" });
    const pool = addBlock("pool", { address: "0xabc", label: "Pool" });
    const caller = blocksRouter.createCaller(ctx(OWNER));
    __setFeatureFlagOverridesForTests({ accessGating: false });
    await expect(
      caller.setAccessRule({ blockId: link.id, access: { kind: "follower", params: {} } })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    __setFeatureFlagOverridesForTests({ accessGating: true });
    await expect(
      blocksRouter
        .createCaller(ctx(FAN))
        .setAccessRule({ blockId: link.id, access: { kind: "follower", params: {} } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.setAccessRule({ blockId: pool.id, access: { kind: "follower", params: {} } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    Object.assign(env, { ACCESS_STAKE_KINDS_ALLOWLIST: "" });
    await expect(
      caller.setAccessRule({
        blockId: link.id,
        access: { kind: "pool_member", params: { poolId: POOL } },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not available for your page yet." });
    expect(db.rules.size).toBe(0);
  });

  it("deleting a gated block deletes its inline rule, never a saved one", async () => {
    const inline = addBlock(
      "text",
      { platform: "text", content: "x" },
      { accessRuleId: addRule("follower", {}) }
    );
    const saved = addRule("follower", {}, "Followers");
    const keep = addBlock("text", { platform: "text", content: "y" }, { accessRuleId: saved });
    await blocksRouter.createCaller(ctx(OWNER)).deleteBlock({ id: inline.id });
    expect(db.rules.size).toBe(1);
    await blocksRouter.createCaller(ctx(OWNER)).deleteBlock({ id: keep.id });
    expect(db.rules.has(db.hex(saved))).toBe(true);
  });
});

describe("access.openBlock", () => {
  it("refuses a non follower with the decision and reveals after they follow", async () => {
    const { text } = gatedFixture();
    const refused = await accessRouter.createCaller(ctx(FAN)).openBlock({ blockId: text.id });
    expect(refused).toMatchObject({ block: null, decision: { reason: "not_follower" } });
    expect(JSON.stringify(refused)).not.toContain("4417");
    db.state.follows.add(FAN);
    const opened = await accessRouter.createCaller(ctx(FAN)).openBlock({ blockId: text.id });
    expect(opened.block).toMatchObject({ kind: "text" });
    expect((opened.block as { content: string }).content).toContain("4417");
  });

  it("answers NOT_FOUND for a hidden or missing block", async () => {
    const hidden = addBlock(
      "text",
      { platform: "text", content: SECRET_TEXT, hidden: true },
      { accessRuleId: addRule("follower", {}) }
    );
    await expect(
      accessRouter.createCaller(ctx(FAN)).openBlock({ blockId: hidden.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      accessRouter.createCaller(ctx(FAN)).openBlock({ blockId: 9999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("access.checkPage with blocks", () => {
  it("answers for the handle's own blocks only", async () => {
    const { link } = gatedFixture();
    const theirs = addBlock(
      "link",
      { platform: "custom", url: SECRET_URL, label: "x" },
      { user_id: 99 }
    );
    const result = await accessRouter.createCaller(ctx(FAN)).checkPage({
      handle: "maya",
      resources: [
        { type: "block", id: String(link.id) },
        { type: "block", id: String(theirs.id) },
        { type: "block", id: "not-a-number" },
      ],
    });
    expect(Object.keys(result)).toEqual([`block:${link.id}`]);
    expect(result[`block:${link.id}`]!.reason).toBe("not_follower");
  });
});

describe("GET /go/:blockId", () => {
  it("sends a signed out visitor to the page with the unlock sheet, never the destination", async () => {
    const { link } = gatedFixture();
    const res = fakeRes();
    await handleGo(goReq(link.id), res);
    expect(res.statusCode).toBe(302);
    expect(res.location).toBe(`https://amped.test/maya?unlock=${link.id}`);
    expect(JSON.stringify(res)).not.toContain(SECRET_URL);
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("redirects a follower to the destination and counts the click", async () => {
    const { link } = gatedFixture();
    db.state.follows.add(FAN);
    const res = fakeRes();
    await handleGo(goReq(link.id, "fan"), res);
    expect(res.statusCode).toBe(302);
    expect(res.location).toBe(SECRET_URL);
    expect(link.clicks).toBe(13);
  });

  it("never redirects to an unsafe scheme", async () => {
    const block = addBlock("link", { platform: "custom", url: "javascript:alert(1)", label: "x" });
    const res = fakeRes();
    await handleGo(goReq(block.id), res);
    expect(res.statusCode).toBe(404);
  });

  it("is off with the flag, refuses bad ids and limits to 60 a minute", async () => {
    const { open } = gatedFixture();
    __setFeatureFlagOverridesForTests({ accessGating: false });
    let res = fakeRes();
    await handleGo(goReq(open.id), res);
    expect(res.statusCode).toBe(404);
    __setFeatureFlagOverridesForTests({ accessGating: true });
    res = fakeRes();
    await handleGo(goReq("../etc"), res);
    expect(res.statusCode).toBe(404);
    for (let i = 0; i < 60; i += 1) await handleGo(goReq(open.id), fakeRes());
    res = fakeRes();
    await handleGo(goReq(open.id), res);
    expect(res.statusCode).toBe(429);
  });
});
