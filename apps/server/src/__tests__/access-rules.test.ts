/**
 * Access rules management (Build Board #21, PR G1, spec 3.6). The database and
 * cache are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetStakeKindsAllowlistCacheForTests } from "../services/access/allowlist";

const state = vi.hoisted(() => ({
  poolOwner: 10 as number | null,
  offer: null as null | { creatorUserId: number; status: string },
  created: [] as Array<Record<string, unknown>>,
  rule: { ownerUserId: 10, kind: "follower" } as null | { ownerUserId: number; kind: string },
  blocks: 0,
  items: 0,
  combos: [] as Array<{ params: unknown }>,
  leaves: [] as Array<{ ownerUserId: number; kind: string }>,
  deleted: 0,
  updated: [] as Array<Record<string, unknown>>,
  allowlist: "10",
  rows: new Map<
    string,
    { ownerUserId: number; name: string | null; kind: string; params: unknown }
  >(),
}));

vi.mock("../env", () => ({
  env: {
    get ACCESS_STAKE_KINDS_ALLOWLIST() {
      return state.allowlist;
    },
  },
}));

vi.mock("../utils/cache", () => ({
  cache: { get: vi.fn(async () => null), set: vi.fn(), delete: vi.fn(async () => true) },
}));
vi.mock("@repo/database", () => ({
  prisma: {
    siteSettings: { findUnique: vi.fn(async () => null) },
    creatorPool: {
      findUnique: vi.fn(async () =>
        state.poolOwner === null ? null : { wallet: { userId: state.poolOwner } }
      ),
    },
    accessRule: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: Buffer } }) =>
        state.rows.size ? (state.rows.get(where.id.toString("hex")) ?? null) : state.rule
      ),
      findMany: vi.fn(async ({ where }: { where: { id?: unknown; kind?: unknown } }) =>
        where.id ? state.leaves : state.combos
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updated.push(data);
      }),
      delete: vi.fn(async ({ where }: { where: { id: Buffer } }) => {
        state.deleted += 1;
        state.rows.delete(where.id.toString("hex"));
      }),
    },
    offer: { findUnique: vi.fn(async () => state.offer) },
    block: { count: vi.fn(async () => state.blocks) },
    contentItem: { count: vi.fn(async () => state.items) },
  },
}));

import { cleanupInlineRule, createRule, deleteRule, updateRule } from "../services/access/rules";

beforeEach(() => {
  __resetStakeKindsAllowlistCacheForTests();
  state.poolOwner = 10;
  state.offer = null;
  state.created = [];
  state.rule = { ownerUserId: 10, kind: "follower" };
  state.blocks = 0;
  state.items = 0;
  state.combos = [];
  state.leaves = [];
  state.deleted = 0;
  state.updated = [];
  state.allowlist = "10";
  state.rows = new Map();
});

describe("createRule", () => {
  it("stores a stake minimum in wei from whole tREVO", async () => {
    await createRule(10, { kind: "stake_min", params: { poolId: 5, minTrevo: "500" } });
    expect(state.created[0]!.params).toEqual({ poolId: 5, minWei: "500000000000000000000" });
  });

  it("refuses another creator's pool", async () => {
    state.poolOwner = 99;
    await expect(createRule(10, { kind: "pool_member", params: { poolId: 5 } })).rejects.toThrow(
      "Pick your own pool."
    );
  });

  it("combinators take 2 to 4 of the owner's own single rules", async () => {
    const ids = ["aa".repeat(16), "bb".repeat(16)];
    state.leaves = [
      { ownerUserId: 10, kind: "follower" },
      { ownerUserId: 10, kind: "any" },
    ];
    await expect(createRule(10, { kind: "any", params: { ruleIds: ids } })).rejects.toThrow();
    state.leaves = [
      { ownerUserId: 10, kind: "follower" },
      { ownerUserId: 10, kind: "pool_member" },
    ];
    await createRule(10, { kind: "any", params: { ruleIds: ids } });
    expect(state.created).toHaveLength(1);
  });
});

describe("updateRule and deleteRule", () => {
  it("kind is immutable and an edit bumps version", async () => {
    await expect(
      updateRule(10, "aa".repeat(16), { input: { kind: "pool_member", params: { poolId: 5 } } })
    ).rejects.toThrow("kind cannot change");
    await updateRule(10, "aa".repeat(16), { name: "Fans" });
    expect(state.updated[0]!.version).toEqual({ increment: 1 });
  });

  it("only the owner can change a rule", async () => {
    state.rule = { ownerUserId: 77, kind: "follower" };
    await expect(deleteRule(10, "aa".repeat(16))).rejects.toThrow("Rule not found.");
  });

  it("a rule in use cannot be deleted, including inside a combinator", async () => {
    state.blocks = 1;
    await expect(deleteRule(10, "aa".repeat(16))).rejects.toThrow("used 1 time");
    state.blocks = 0;
    state.combos = [{ params: { ruleIds: ["aa".repeat(16), "bb".repeat(16)] } }];
    await expect(deleteRule(10, "aa".repeat(16))).rejects.toThrow("used 1 time");
    state.combos = [];
    await deleteRule(10, "aa".repeat(16));
    expect(state.deleted).toBe(1);
  });
});

describe("stake allowlist on create (OB-Q65)", () => {
  it("refuses pool fans and a minimum stake outside the allowlist", async () => {
    state.allowlist = "3";
    await expect(
      createRule(10, { kind: "pool_member", params: { poolId: 5 } })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Not available for your page yet." });
    await expect(
      createRule(10, { kind: "stake_min", params: { poolId: 5, minTrevo: "1" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.created).toHaveLength(0);
  });

  it("refuses any and all with a stake leaf outside the allowlist", async () => {
    state.allowlist = "";
    state.leaves = [
      { ownerUserId: 10, kind: "follower" },
      { ownerUserId: 10, kind: "stake_min" },
    ];
    const ids = ["aa".repeat(16), "bb".repeat(16)];
    for (const kind of ["any", "all"] as const) {
      await expect(createRule(10, { kind, params: { ruleIds: ids } })).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Not available for your page yet.",
      });
    }
  });

  it("lets a follower rule through for anyone", async () => {
    state.allowlist = "";
    await createRule(10, { kind: "follower", params: {} });
    expect(state.created).toHaveLength(1);
  });
});

describe("cleanupInlineRule (content gating 3.5)", () => {
  const a = "aa".repeat(16);
  const b = "bb".repeat(16);
  const c = "cc".repeat(16);

  it("deletes an unused inline rule and its inline leaves", async () => {
    state.rows.set(a, { ownerUserId: 10, name: null, kind: "any", params: { ruleIds: [b, c] } });
    state.rows.set(b, { ownerUserId: 10, name: null, kind: "follower", params: {} });
    state.rows.set(c, { ownerUserId: 10, name: "Saved", kind: "pool_member", params: {} });
    const deleted = await cleanupInlineRule((await import("@repo/database")).prisma as never, a);
    expect(deleted).toEqual([a, b]);
    expect(state.rows.has(c)).toBe(true);
  });

  it("keeps an inline rule something else references", async () => {
    state.rows.set(a, { ownerUserId: 10, name: null, kind: "follower", params: {} });
    state.items = 1;
    const db = (await import("@repo/database")).prisma as never;
    expect(await cleanupInlineRule(db, a)).toEqual([]);
    state.items = 0;
    state.blocks = 1;
    expect(await cleanupInlineRule(db, a)).toEqual([]);
    state.blocks = 0;
    state.combos = [{ params: { ruleIds: [a, b] } }];
    expect(await cleanupInlineRule(db, a)).toEqual([]);
    expect(state.deleted).toBe(0);
  });

  it("never deletes a saved rule", async () => {
    state.rows.set(a, { ownerUserId: 10, name: "Followers", kind: "follower", params: {} });
    expect(await cleanupInlineRule((await import("@repo/database")).prisma as never, a)).toEqual(
      []
    );
  });
});

describe("paid rules (G4)", () => {
  const offerId = "cd".repeat(16);

  it("stores the creator's own product", async () => {
    state.offer = { creatorUserId: 10, status: "active" };
    await createRule(10, { kind: "paid", params: { offerId } });
    expect(state.created[0]).toMatchObject({ kind: "paid", params: { offerId } });
  });

  it("allows a draft product, so a creator can set up before going live", async () => {
    state.offer = { creatorUserId: 10, status: "draft" };
    await createRule(10, { kind: "paid", params: { offerId } });
    expect(state.created).toHaveLength(1);
  });

  it("refuses another creator's, a missing or an archived product", async () => {
    for (const offer of [
      { creatorUserId: 11, status: "active" },
      null,
      { creatorUserId: 10, status: "archived" },
    ]) {
      state.offer = offer;
      await expect(createRule(10, { kind: "paid", params: { offerId } })).rejects.toThrow(
        "Pick one of your own products."
      );
    }
    expect(state.created).toHaveLength(0);
  });
});
