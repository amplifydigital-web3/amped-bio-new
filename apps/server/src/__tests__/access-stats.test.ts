/**
 * Access insights (gating spec 3.10 delta 8, G6): aggregates only, small buckets
 * suppressed on the server. The database and the rules list are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sql = { text: string };

const state = vi.hoisted(() => ({
  totals: [] as unknown[],
  byRule: [] as unknown[],
  byItem: [] as unknown[],
  byReason: [] as unknown[],
  queries: [] as string[],
  params: [] as unknown[][],
  rules: [] as Array<Record<string, unknown>>,
  combos: [] as Array<{ params: unknown }>,
  inlineLeaves: [] as Array<{ id: Buffer }>,
  items: [] as Array<{ publicId: string; title: string }>,
  blocks: [] as Array<{ id: number; type: string; config: unknown }>,
}));

vi.mock("@repo/database", () => {
  const flatten = (strings: readonly string[], values: unknown[]) => {
    let text = strings[0] ?? "";
    const params: unknown[] = [];
    values.forEach((value, i) => {
      if (value && typeof value === "object" && "text" in (value as object)) {
        text += (value as { text: string }).text;
        params.push(...((value as { params?: unknown[] }).params ?? []));
      } else {
        text += "?";
        params.push(value);
      }
      text += strings[i + 1] ?? "";
    });
    return { text, params };
  };
  return {
    Prisma: {
      sql: (strings: readonly string[], ...values: unknown[]) => flatten(strings, values),
    },
    prisma: {
      $queryRaw: vi.fn(async (strings: readonly string[], ...values: unknown[]) => {
        const { text, params } = flatten(strings, values);
        state.queries.push(text);
        state.params.push(params);
        if (text.includes("GROUP BY rule_id")) return state.byRule;
        if (text.includes("GROUP BY resource")) return state.byItem;
        if (text.includes("GROUP BY reason")) return state.byReason;
        return state.totals;
      }),
      accessRule: {
        findMany: vi.fn(async ({ where }: { where: { name?: null } }) =>
          "name" in where ? state.inlineLeaves : state.combos
        ),
      },
      contentItem: { findMany: vi.fn(async () => state.items) },
      block: { findMany: vi.fn(async () => state.blocks) },
    },
  };
});
vi.mock("../services/access/rules", () => ({
  idToHex: (id: Uint8Array) => Buffer.from(id).toString("hex"),
  listRules: vi.fn(async () => state.rules),
}));

import { accessOpenRate, accessStatCount } from "@repo/constants";
import { accessRulesStats } from "../services/access/stats";

const OWNER = 10;
const RULE = "aa".repeat(16);
const COMBO = "bb".repeat(16);
const LEAF = "cc".repeat(16);
const now = new Date("2026-11-05T12:00:00Z");
const counts = (k: unknown, locked: number, tried: number, opened: number) => ({
  k,
  locked: BigInt(locked),
  tried: BigInt(tried),
  opened: BigInt(opened),
});
const ruleRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: null,
  kind: "follower",
  valid: true,
  params: {},
  opensToAllAt: null,
  uses: 1,
  ...extra,
});

beforeEach(() => {
  state.totals = [counts(null, 0, 0, 0)];
  state.byRule = [];
  state.byItem = [];
  state.byReason = [];
  state.queries = [];
  state.params = [];
  state.rules = [];
  state.combos = [];
  state.inlineLeaves = [];
  state.items = [];
  state.blocks = [];
});

describe("small bucket rule (delta 8)", () => {
  it("shows 1 to 4 as under_5 and keeps 0 and 5 and up", () => {
    expect([0, 1, 4, 5, 120].map(accessStatCount)).toEqual([0, "under_5", "under_5", 5, 120]);
  });

  it("gives a rate only when both sides are 5 or more", () => {
    expect(accessOpenRate(4, 40)).toBeNull();
    expect(accessOpenRate(5, 4)).toBeNull();
    expect(accessOpenRate(9, 20)).toBe(45);
  });
});

describe("accessRulesStats", () => {
  it("reads only the owner's events in the range, with rule events only", async () => {
    await accessRulesStats(OWNER, "7d", now);
    expect(state.queries).toHaveLength(4);
    for (const [i, query] of state.queries.entries()) {
      expect(query).toContain("owner_user_id = ?");
      expect(query).toContain("rule_id IS NOT NULL");
      expect(query).toContain("COUNT(DISTINCT");
      expect(state.params[i]![0]).toBe(OWNER);
      expect(state.params[i]![1]).toEqual(new Date("2026-10-29T12:00:00Z"));
    }
  });

  it("never selects a viewer key or a time as a column", async () => {
    await accessRulesStats(OWNER, "30d", now);
    for (const query of state.queries) {
      const select = query.slice(0, query.indexOf("FROM"));
      expect(select).not.toMatch(/SELECT\s+viewer_key|,\s*viewer_key\s*(,|$)|created_at/);
    }
  });

  it("suppresses small buckets in totals, rules, items and reasons", async () => {
    state.totals = [counts(null, 40, 12, 3)];
    state.rules = [ruleRow(RULE, { name: "VIP", uses: 3 })];
    state.byRule = [counts(Buffer.from(RULE, "hex"), 40, 12, 3)];
    state.byItem = [counts("content:abc123", 2, 1, 0), counts("block:7", 30, 9, 6)];
    state.items = [{ publicId: "abc123", title: "Studio session" }];
    state.blocks = [{ id: 7, type: "link", config: { label: "VIP room", url: "https://x" } }];
    state.byReason = [
      { reason: "not_follower", viewers: 31n },
      { reason: "blocked", viewers: 1n },
    ];
    const stats = await accessRulesStats(OWNER, "30d", now);
    expect(stats.totals).toEqual({
      lockedViewers: 40,
      triedViewers: 12,
      openedViewers: "under_5",
      openRate: null,
    });
    expect(stats.rules).toEqual([
      expect.objectContaining({
        ruleId: RULE,
        name: "VIP",
        summary: "Followers",
        uses: 3,
        lockedViewers: 40,
        openedViewers: "under_5",
      }),
    ]);
    expect(stats.items).toEqual([
      expect.objectContaining({
        type: "content",
        id: "abc123",
        label: "Studio session",
        lockedViewers: "under_5",
        triedViewers: "under_5",
        openedViewers: 0,
      }),
      expect.objectContaining({ type: "block", id: "7", label: "VIP room", openRate: 67 }),
    ]);
    expect(stats.reasons).toEqual([
      { reason: "not_follower", viewers: 31 },
      { reason: "blocked", viewers: "under_5" },
    ]);
    // Never a destination or a fan detail
    expect(JSON.stringify(stats)).not.toContain("https://x");
  });

  it("lists rules in use or named, with zeros for a rule nobody saw", async () => {
    state.rules = [
      ruleRow(RULE, { uses: 2 }),
      ruleRow("dd".repeat(16), { name: "Saved, unused", uses: 0 }),
      ruleRow("ee".repeat(16), { uses: 0 }),
    ];
    const stats = await accessRulesStats(OWNER, "30d", now);
    expect(stats.rules.map(rule => rule.ruleId)).toEqual([RULE, "dd".repeat(16)]);
    expect(stats.rules[0]).toMatchObject({ lockedViewers: 0, openRate: null });
  });

  it("hides the inline leaves of Any of these; the combinator carries the events", async () => {
    state.rules = [
      ruleRow(COMBO, { kind: "any", uses: 1 }),
      ruleRow(LEAF, { kind: "follower", uses: 1 }),
    ];
    state.combos = [{ params: { ruleIds: [LEAF, RULE] } }];
    state.inlineLeaves = [{ id: Buffer.from(LEAF, "hex") }];
    const stats = await accessRulesStats(OWNER, "30d", now);
    expect(stats.rules.map(rule => rule.ruleId)).toEqual([COMBO]);
    expect(stats.rules[0]!.summary).toBe("Any of these");
  });

  it("drops an item that is no longer on the owner's page and an unknown reason", async () => {
    state.byItem = [counts("content:gone", 9, 9, 9)];
    state.byReason = [{ reason: "made_up", viewers: 9n }];
    const stats = await accessRulesStats(OWNER, "30d", now);
    expect(stats.items).toEqual([]);
    expect(stats.reasons).toEqual([]);
  });
});
