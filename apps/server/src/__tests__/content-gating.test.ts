/**
 * Content gating, PR C8 (docs/features/content-gating.md section 5): the content
 * resolver, locked cards and the locked page, getReadUrl through open,
 * getPreview, access.checkPage, rule writing on content.update with inline
 * cleanup, progress, and the content part of the leak test.
 *
 * The database is an in memory fake. Media and Stream tokens are faked to
 * markers ("tok:<role>"), so a test can see exactly which roles were signed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { OWNER, FAN, POOL } = vi.hoisted(() => ({ OWNER: 7, FAN: 20, POOL: 5 }));

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const assets: Row[] = [];
  const rules = new Map<string, Row>();
  const progress: Row[] = [];
  const events: Row[] = [];
  const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
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
      if ("lte" in cond) return value != null && value <= cond.lte;
    }
    return same(value ?? null, cond);
  };
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, cond]) =>
      key === "OR" ? (cond as Row[]).some(part => matches(row, part)) : test(row[key], cond)
    );
  const copy = (row: Row) => ({ ...row });
  const state = {
    follows: new Set<number>(),
    poolOwner: OWNER as number,
  };
  const prisma: any = {
    user: {
      findFirst: vi.fn(async ({ where }: any) =>
        where.handle === "maya" && where.page_status === "PUBLISHED" && where.block === "no"
          ? { id: OWNER, handle: "maya", name: "Maya Lin", image: null, image_file_id: null }
          : null
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === OWNER
          ? { id: OWNER, handle: "maya", block: "no", page_status: "PUBLISHED" }
          : { id: where.id, block: "no" }
      ),
    },
    followBlock: { findUnique: vi.fn(async () => null) },
    creatorPool: {
      findUnique: vi.fn(async () => ({ wallet: { userId: state.poolOwner } })),
      findFirst: vi.fn(async () => ({ id: POOL })),
      findMany: vi.fn(async () => [{ id: POOL, poolAddress: "0xpool" }]),
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
    },
    block: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    accessRule: {
      create: vi.fn(async ({ data }: any) => {
        rules.set(hex(data.id), { ...data, opensToAllAt: null, version: 1 });
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = rules.get(hex(where.id));
        return row ? copy(row) : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        [...rules.values()].filter(row => matches(row, where)).map(copy)
      ),
      delete: vi.fn(async ({ where }: any) => {
        rules.delete(hex(where.id));
      }),
    },
    accessEvent: {
      create: vi.fn(async ({ data }: any) => {
        events.push(data);
      }),
    },
    viewerProgress: {
      upsert: vi.fn(async ({ create }: any) => {
        progress.push(create);
      }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, items, assets, rules, progress, events, state, hex };
});

const limiter = vi.hoisted(() => ({ hits: new Map<string, number>() }));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: { JsonNull: "JsonNull" } }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
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
vi.mock("../services/analytics/visitorIp", () => ({ getVisitorIp: () => ({ ip: "203.0.113.9" }) }));
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
  loadPool: vi.fn(async () => ({
    id: POOL,
    ownerUserId: OWNER,
    chainId: "1",
    poolAddress: "0xpool",
  })),
  mirrorStakeWei: vi.fn(async () => 0n),
  chainStakeWei: vi.fn(async () => {
    throw new Error("rpc down");
  }),
}));
vi.mock("../services/cloudflare/mediaToken", () => ({
  signMediaToken: (payload: { r: string }) => `tok:${payload.r}`,
  mediaUrl: (key: string, token: string) => `https://media.test/${key}?t=${token}`,
  newDownloadJti: () => "jti",
}));
vi.mock("../services/cloudflare/stream", () => ({
  signStreamToken: ({ uid }: { uid: string }) => `stok:${uid}`,
  deleteStreamVideo: vi.fn(async () => {}),
  enableStreamDownloads: vi.fn(async () => ({})),
  createStreamDirectUpload: vi.fn(),
  updateStreamVideo: vi.fn(),
  getStreamVideo: vi.fn(),
  putStreamCaptions: vi.fn(),
  deleteStreamCaptions: vi.fn(),
}));
vi.mock("../services/content/job", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/content/job")>()),
  streamCustomerHost: async () => "stream.test",
}));

import { env } from "../env";
import { contentRouter } from "../trpc/content";
import { accessRouter } from "../trpc/access";
import { progressRouter } from "../trpc/progress";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { clearEventDedupe } from "../services/access/engine";
import { contentResolver } from "../services/access/resolvers/content";
import {
  contentSitemapEntries,
  hasPublicContent,
  publicCardsFor,
} from "../services/content/publicView";

const ctx = (sub: number | null) =>
  ({
    user: sub === null ? undefined : { sub, wallet: sub === FAN ? "0xfan" : null },
    req: { headers: { "user-agent": "UA" } },
  }) as never;
const content = (sub: number | null) => contentRouter.createCaller(ctx(sub));
const access = (sub: number | null) => accessRouter.createCaller(ctx(sub));
const progress = (sub: number) => progressRouter.createCaller(ctx(sub));

let seq = 0;
function addItem(extra: Record<string, unknown> = {}) {
  seq += 1;
  const row = {
    id: Buffer.alloc(16, seq),
    publicId: `item${String(seq).padStart(12, "0")}`,
    userId: OWNER,
    kind: "VIDEO",
    title: `Item ${seq}`,
    description: "Behind the scenes notes",
    status: "READY",
    publishState: "PUBLISHED",
    moderationState: "CLEAR",
    accessRuleId: null as Buffer | null,
    baseAccessRuleId: null,
    adult: false,
    allowDownload: true,
    deletedAt: null,
    purgeAfter: null,
    publishedAt: new Date("2026-10-01"),
    previewConfig: null,
    chapters: [{ startMs: 0, title: "Intro" }],
    durationMs: 125_000,
    pageCount: null,
    width: null,
    height: null,
    totalBytes: 2048n,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { page_status: "PUBLISHED", block: "no", handle: "maya", name: "Maya Lin" },
    ...extra,
  };
  db.items.push(row);
  const asset = (role: string, more: Record<string, unknown> = {}) =>
    db.assets.push({
      contentItemId: row.id,
      role,
      storage: "R2",
      r2Key: `derived/${row.publicId}/${role.toLowerCase()}/${more.variant ?? "x"}`,
      streamUid: null,
      variant: null,
      lang: null,
      mimeType: null,
      width: 640,
      height: 360,
      scanStatus: "CLEAN",
      ...more,
    });
  asset("STREAM", { storage: "STREAM", r2Key: null, streamUid: `full-${seq}` });
  asset("PREVIEW_CLIP", { storage: "STREAM", r2Key: null, streamUid: `clip-${seq}` });
  asset("COVER", { variant: "640.webp" });
  asset("COVER", { variant: "1280.jpg" });
  asset("BLUR", { variant: "blur.webp" });
  asset("ORIGINAL", { variant: "source" });
  return row;
}

function addRule(kind: string, params: Record<string, unknown>, name: string | null = null) {
  const id = Buffer.alloc(16, 200 + db.rules.size);
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

beforeEach(() => {
  db.items.length = 0;
  db.assets.length = 0;
  db.rules.clear();
  db.progress.length = 0;
  db.events.length = 0;
  db.state.follows.clear();
  db.state.poolOwner = OWNER;
  limiter.hits.clear();
  clearEventDedupe();
  __setFeatureFlagOverridesForTests({ accessGating: true });
  Object.assign(env, { ACCESS_STAKE_KINDS_ALLOWLIST: String(OWNER) });
});

describe("content resolver (3.1)", () => {
  it("is available only for a ready, published, clear, clean item", async () => {
    const ok = addItem({ accessRuleId: addRule("follower", {}) });
    expect(await contentResolver.get(ok.publicId)).toMatchObject({
      ownerUserId: OWNER,
      adult: false,
      available: true,
    });
    for (const extra of [
      { status: "PROCESSING" },
      { publishState: "DRAFT" },
      { moderationState: "HELD" },
      { deletedAt: new Date() },
    ]) {
      const item = addItem(extra);
      expect((await contentResolver.get(item.publicId))!.available).toBe(false);
    }
    const dirty = addItem();
    db.assets.find(a => a.contentItemId === dirty.id && a.role === "COVER")!.scanStatus =
      "INFECTED";
    expect((await contentResolver.get(dirty.publicId))!.available).toBe(false);
  });

  it("returns null for a bad or unknown id", async () => {
    expect(await contentResolver.get("../etc")).toBeNull();
    expect(await contentResolver.get("zzzzzzzzzzzzzzzz")).toBeNull();
  });
});

describe("getReadUrl through open (3.3)", () => {
  it("lets the owner and everyone open a public item", async () => {
    const item = addItem();
    const owner = await content(OWNER).getReadUrl({ publicId: item.publicId });
    expect(owner.playback?.video?.hls).toContain("stok:full-");
    const anon = await content(null).getReadUrl({ publicId: item.publicId });
    expect(anon.decision?.reason).toBe("public");
    expect(anon.playback).not.toBeNull();
  });

  it("refuses a non follower with the decision, then opens once they follow", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    const refused = await content(FAN).getReadUrl({ publicId: item.publicId });
    expect(refused).toMatchObject({ playback: null, download: null });
    expect(refused.decision).toMatchObject({
      allowed: false,
      reason: "not_follower",
      hint: { action: "follow", creatorHandle: "maya" },
    });
    db.state.follows.add(FAN);
    const opened = await content(FAN).getReadUrl({ publicId: item.publicId });
    expect(opened.decision?.allowed).toBe(true);
    expect(opened.playback?.video?.hls).toContain("stok:full-");
  });

  it("asks a signed out viewer to sign in", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    const refused = await content(null).getReadUrl({ publicId: item.publicId });
    expect(refused.decision?.hint).toEqual({ action: "sign_in" });
  });

  it("refuses a stake rule outside the allowlist", async () => {
    Object.assign(env, { ACCESS_STAKE_KINDS_ALLOWLIST: "" });
    const item = addItem({ accessRuleId: addRule("pool_member", { poolId: POOL }) });
    const refused = await content(FAN).getReadUrl({ publicId: item.publicId });
    expect(refused.decision?.reason).toBe("kind_unavailable");
    expect(refused.playback).toBeNull();
  });

  it("refuses when the chain can not be read", async () => {
    const item = addItem({ accessRuleId: addRule("pool_member", { poolId: POOL }) });
    const refused = await content(FAN).getReadUrl({ publicId: item.publicId });
    expect(refused.decision?.reason).toBe("chain_unavailable");
  });

  it("runs the 18+ check before the rule", async () => {
    db.state.follows.add(FAN);
    const item = addItem({ adult: true, accessRuleId: addRule("follower", {}) });
    const refused = await content(FAN).getReadUrl({ publicId: item.publicId });
    expect(refused.decision?.reason).toBe("age_check_required");
    expect(refused.decision?.hint).toEqual({ action: "verify_age" });
  });

  it("answers NOT_FOUND for a missing or unavailable item", async () => {
    const draft = addItem({ publishState: "DRAFT", accessRuleId: addRule("follower", {}) });
    await expect(content(FAN).getReadUrl({ publicId: draft.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses a download to a locked viewer before the daily count", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    const refused = await content(FAN).getReadUrl({ publicId: item.publicId, download: true });
    expect(refused.download).toBeNull();
    expect([...limiter.hits.keys()].some(key => key.startsWith("content-dl:"))).toBe(false);
  });

  it("signs a gated item with the private lifetimes", async () => {
    db.state.follows.add(FAN);
    const item = addItem({ durationMs: 60_000, accessRuleId: addRule("follower", {}) });
    const opened = await content(FAN).getReadUrl({ publicId: item.publicId });
    // private: duration + 10 minutes, far under the 24 hour public image lifetime
    expect(opened.playback!.expiresAt - Date.now()).toBeLessThan(15 * 60 * 1000);
  });
});

describe("getPreview (3.3)", () => {
  it("gives a locked viewer only preview roles, 1 hour", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    const preview = await content(FAN).getPreview({ publicId: item.publicId });
    expect(preview.clip?.hls).toContain(`stok:clip-`);
    expect(preview.blur).toContain("tok:blur");
    const json = JSON.stringify(preview);
    expect(json).not.toContain("stok:full-");
    for (const role of ["tok:cover", "tok:original", "tok:rendition", "tok:waveform"]) {
      expect(json).not.toContain(role);
    }
    expect(preview.expiresAt - Date.now()).toBeLessThanOrEqual(3600 * 1000);
    expect(preview.decision.reason).toBe("not_follower");
  });

  it("shows no media to a viewer who has not passed the 18+ check", async () => {
    const item = addItem({ adult: true, accessRuleId: addRule("follower", {}) });
    const preview = await content(FAN).getPreview({ publicId: item.publicId });
    expect(preview).toMatchObject({ blur: null, clip: null, audio: null, pages: [] });
  });

  it("is off while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ accessGating: false });
    const item = addItem();
    await expect(content(FAN).getPreview({ publicId: item.publicId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("access.checkPage (3.4)", () => {
  it("answers for the handle's own content and drops anything else", async () => {
    const mine = addItem({ accessRuleId: addRule("follower", {}) });
    const theirs = addItem({ userId: 99 });
    const result = await access(FAN).checkPage({
      handle: "maya",
      resources: [
        { type: "content", id: mine.publicId },
        { type: "content", id: theirs.publicId },
        { type: "block", id: "12" },
      ],
    });
    expect(Object.keys(result)).toEqual([`content:${mine.publicId}`]);
    expect(result[`content:${mine.publicId}`]!.reason).toBe("not_follower");
  });

  it("takes at most 48 resources and counts one rate limit hit per call", async () => {
    const resources = Array.from({ length: 49 }, (_, i) => ({
      type: "content" as const,
      id: `item${String(i).padStart(12, "0")}`,
    }));
    await expect(access(FAN).checkPage({ handle: "maya", resources })).rejects.toThrow();
    const ids = Array.from({ length: 10 }, () => addItem().publicId);
    await access(FAN).checkPage({
      handle: "maya",
      resources: ids.map(id => ({ type: "content", id })),
    });
    expect(limiter.hits.get(`access_check_page:u:${FAN}`)).toBe(1);
  });

  it("refuses while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ accessGating: false });
    await expect(
      access(FAN).checkPage({
        handle: "maya",
        resources: [{ type: "content", id: "a".repeat(16) }],
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("content.update access (3.5)", () => {
  it("refuses while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ accessGating: false });
    const item = addItem();
    await expect(
      content(OWNER).update({ publicId: item.publicId, access: { kind: "follower", params: {} } })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Gating is not available yet.",
    });
  });

  it("creates an inline rule, and clears it back to Everyone", async () => {
    const item = addItem();
    await content(OWNER).update({
      publicId: item.publicId,
      access: { kind: "follower", params: {} },
    });
    expect(db.items[0]!.accessRuleId).not.toBeNull();
    expect([...db.rules.values()][0]).toMatchObject({ kind: "follower", name: null });
    await content(OWNER).update({ publicId: item.publicId, access: null });
    expect(db.items[0]!.accessRuleId).toBeNull();
    expect(db.rules.size).toBe(0);
  });

  it("creates Any of these over inline leaves in one transaction, and cleans them up", async () => {
    const item = addItem();
    await content(OWNER).update({
      publicId: item.publicId,
      access: {
        kind: "any",
        leaves: [
          { kind: "follower", params: {} },
          { kind: "stake_min", params: { poolId: POOL, minTrevo: "100" } },
        ],
      },
    });
    expect(db.rules.size).toBe(3);
    const top = db.rules.get(db.hex(db.items[0]!.accessRuleId))!;
    expect(top.kind).toBe("any");
    await content(OWNER).update({
      publicId: item.publicId,
      access: { kind: "follower", params: {} },
    });
    expect(db.rules.size).toBe(1);
  });

  it("refuses stake kinds outside the allowlist, also inside any", async () => {
    Object.assign(env, { ACCESS_STAKE_KINDS_ALLOWLIST: "" });
    const item = addItem();
    for (const rule of [
      { kind: "pool_member" as const, params: { poolId: POOL } },
      {
        kind: "any" as const,
        leaves: [
          { kind: "follower" as const, params: {} },
          { kind: "pool_member" as const, params: { poolId: POOL } },
        ],
      },
    ]) {
      await expect(
        content(OWNER).update({ publicId: item.publicId, access: rule })
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not available for your page yet." });
    }
    expect(db.rules.size).toBe(0);
  });

  it("refuses kinds that are not live and a saved rule owned by someone else", async () => {
    const item = addItem();
    await expect(
      content(OWNER).update({
        publicId: item.publicId,
        access: { kind: "member", params: { planId: 1 } } as never,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const paid = addRule("paid", { offerId: "a".repeat(32) }, "Paid");
    await expect(
      content(OWNER).update({ publicId: item.publicId, access: { ruleId: db.hex(paid) } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const other = addRule("follower", {}, "Theirs");
    db.rules.get(db.hex(other))!.ownerUserId = 99;
    await expect(
      content(OWNER).update({ publicId: item.publicId, access: { ruleId: db.hex(other) } })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps a saved rule and an inline rule another item uses", async () => {
    const saved = addRule("follower", {}, "Followers");
    const item = addItem({ accessRuleId: saved });
    await content(OWNER).update({ publicId: item.publicId, access: null });
    expect(db.rules.has(db.hex(saved))).toBe(true);
    const shared = addRule("follower", {});
    const a = addItem({ accessRuleId: shared });
    addItem({ accessRuleId: shared });
    await content(OWNER).update({ publicId: a.publicId, access: null });
    expect(db.rules.has(db.hex(shared))).toBe(true);
  });
});

describe("progress (3.3)", () => {
  it("ignores a locked viewer and saves for one who passes", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    expect(await progress(FAN).set({ publicId: item.publicId, positionMs: 5000 })).toEqual({
      saved: false,
    });
    db.state.follows.add(FAN);
    expect(await progress(FAN).set({ publicId: item.publicId, positionMs: 5000 })).toEqual({
      saved: true,
    });
  });
});

describe("access events (3.6)", () => {
  it("records one locked render per viewer and item in 10 minutes", async () => {
    const item = addItem({ accessRuleId: addRule("follower", {}) });
    const resources = [{ type: "content" as const, id: item.publicId }];
    for (let i = 0; i < 4; i += 1) await access(FAN).checkPage({ handle: "maya", resources });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(db.events.filter(event => event.type === "locked_view")).toHaveLength(1);
  });
});

describe("leak test, content part (gating acceptance 5)", () => {
  function gatedFixture() {
    const open = addItem({ title: "Open" });
    const gated = addItem({
      title: "Locked",
      accessRuleId: addRule("stake_min", { poolId: POOL, minWei: "100000000000000000000" }),
    });
    return { open, gated };
  }

  const forbidden = (json: string) => {
    for (const marker of [
      "stok:",
      "tok:cover",
      "tok:rendition",
      "tok:original",
      "tok:waveform",
      "Behind the scenes",
      "100000000000000000000",
      "minWei",
      "poolId",
    ]) {
      expect(json).not.toContain(marker);
    }
  };

  it("shows a gated item locked on the bio, the feed and the item page, signed out", async () => {
    const { open, gated } = gatedFixture();
    const bio = await content(null).listForBio({
      handle: "maya",
      publicIds: [open.publicId, gated.publicId],
    });
    const locked = bio.cards[gated.publicId]!;
    expect(locked).toMatchObject({
      cover: null,
      gate: {
        kind: "stake_min",
        summary: "Fans with a minimum stake",
        stake: true,
        poolAddress: "0xpool",
      },
    });
    expect(locked.blur).toContain("tok:blur");
    forbidden(JSON.stringify(locked));
    expect(bio.cards[open.publicId]!.cover).not.toBeNull();

    const feed = await content(null).feed({ handle: "maya", limit: 24 });
    forbidden(JSON.stringify(feed.items.find(card => card.publicId === gated.publicId)));

    const page = await content(null).getPublic({ handle: "maya", publicId: gated.publicId });
    expect(page).toMatchObject({ description: null, chapters: [], captionLangs: [] });
    forbidden(JSON.stringify(page));
  });

  it("never lists a gated item in the sitemap or the indexable feed rule", async () => {
    const { gated } = gatedFixture();
    db.items.forEach(item => (item.user = { ...item.user, email_verified: true }));
    const entries = await contentSitemapEntries(0, 100);
    expect(entries.map(entry => entry.publicId)).not.toContain(gated.publicId);
    db.items.splice(0, db.items.length, db.items.find(item => item.publicId === gated.publicId)!);
    expect(await hasPublicContent(OWNER)).toBe(false);
  });

  it("keeps gated items off public pages while the flag is off", async () => {
    __setFeatureFlagOverridesForTests({ accessGating: false });
    const { open, gated } = gatedFixture();
    const cards = await publicCardsFor(OWNER, [open.publicId, gated.publicId]);
    expect(Object.keys(cards)).toEqual([open.publicId]);
  });
});
