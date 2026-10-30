/**
 * Access rules management (Build Board #21, PR G1, spec 3.6). The database and
 * cache are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  poolOwner: 10 as number | null,
  created: [] as Array<Record<string, unknown>>,
  rule: { ownerUserId: 10, kind: "follower" } as null | { ownerUserId: number; kind: string },
  blocks: 0,
  items: 0,
  combos: [] as Array<{ params: unknown }>,
  leaves: [] as Array<{ ownerUserId: number; kind: string }>,
  deleted: 0,
  updated: [] as Array<Record<string, unknown>>,
}));

vi.mock("../utils/cache", () => ({
  cache: { get: vi.fn(async () => null), set: vi.fn(), delete: vi.fn(async () => true) },
}));
vi.mock("@repo/database", () => ({
  prisma: {
    creatorPool: {
      findUnique: vi.fn(async () =>
        state.poolOwner === null ? null : { wallet: { userId: state.poolOwner } }
      ),
    },
    accessRule: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
      }),
      findUnique: vi.fn(async () => state.rule),
      findMany: vi.fn(async ({ where }: { where: { id?: unknown; kind?: unknown } }) =>
        where.id ? state.leaves : state.combos
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updated.push(data);
      }),
      delete: vi.fn(async () => {
        state.deleted += 1;
      }),
    },
    block: { count: vi.fn(async () => state.blocks) },
    contentItem: { count: vi.fn(async () => state.items) },
  },
}));

import { createRule, deleteRule, updateRule } from "../services/access/rules";

beforeEach(() => {
  state.poolOwner = 10;
  state.created = [];
  state.rule = { ownerUserId: 10, kind: "follower" };
  state.blocks = 0;
  state.items = 0;
  state.combos = [];
  state.leaves = [];
  state.deleted = 0;
  state.updated = [];
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
