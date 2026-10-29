/**
 * Pool list paging (Build Board D7, PL2). docs/features/pools-list-paging.md section 4.
 * The SQL itself was also run against MariaDB 10.11 with every migration applied and
 * 5,000 seeded pools (handoff: docs/fixes/pools-paged-api.md).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  queries: [] as { sql: string; values: unknown[] }[],
  pageRows: [] as unknown[],
  total: 0,
  rateLimits: [] as { key: string; limit: number }[][],
}));

vi.mock("@repo/database", async () => {
  const runtime = await import("@prisma/client/runtime/library");
  return {
    Prisma: {
      sql: runtime.sqltag,
      join: runtime.join,
      raw: runtime.raw,
      empty: runtime.empty,
    },
    prisma: {
      $queryRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
        state.queries.push({ sql: query.sql, values: query.values });
        if (query.sql.includes("COUNT(*)")) return [{ total: BigInt(state.total) }];
        return state.pageRows;
      }),
    },
  };
});

vi.mock("../utils/cache", () => ({
  cache: {
    get: vi.fn(async (key: string) => (state.cache.has(key) ? state.cache.get(key) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      state.cache.set(key, JSON.parse(JSON.stringify(value)));
    }),
  },
  CACHE_TTL: { APY: 14400 },
  getAPYCacheKey: (chain: number, address: string) => `apy:${chain}:${address}`,
  getPoolsCacheKey: (chain: number, address: string) => `pools_public_data:${chain}:${address}`,
  getRedisClient: () => null,
}));

vi.mock("../utils/rateLimit", () => ({
  enforceRateLimits: vi.fn(async (rules: { key: string; limit: number }[]) => {
    state.rateLimits.push(rules);
  }),
}));

vi.mock("../services/analytics/visitorIp", () => ({
  getVisitorIp: () => ({ ip: "203.0.113.9" }),
}));

vi.mock("../services/S3Service", () => ({
  s3Service: { getFileUrl: (key: string) => `https://cdn.test/${key}` },
}));

vi.mock("@repo/web3", () => ({
  getChainConfig: (id: number) => (id === 73863 ? { id } : null),
  getRpcTransport: () => null,
  calculatePoolAPY: vi.fn(async () => ({})),
}));

vi.mock("viem", async importOriginal => ({
  ...(await importOriginal<typeof import("viem")>()),
  createPublicClient: () => ({}),
}));

vi.mock("../trpc/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ req: unknown }>().create();
  return { router: t.router, publicProcedure: t.procedure };
});

import {
  cursorAfter,
  decodeCursor,
  encodeCursor,
  escapeLike,
  pageQuery,
  parseSearch,
  TEN_K_STAKE_WEI,
  type PageRow,
} from "../services/poolList";
import { poolsListRouter } from "../trpc/pools/list";
import { calculatePoolAPY } from "@repo/web3";

const E = 10n ** 18n;

function row(id: number, extra: Partial<PageRow> = {}): PageRow {
  return {
    id,
    name: `Pool ${id}`,
    description: null,
    chainId: "73863",
    poolAddress: `0x${id.toString(16).padStart(40, "0")}`,
    imageFileId: null,
    s3Key: null,
    totalStakeWei: (BigInt(id) * E).toString(),
    activeFans: id,
    nameKey: `Pool ${id}`,
    tier: 0,
    ...extra,
  };
}

const caller = () => poolsListRouter.createCaller({ req: {} } as never);

beforeEach(() => {
  state.cache.clear();
  state.queries.length = 0;
  state.pageRows = [];
  state.total = 0;
  state.rateLimits.length = 0;
});

describe("cursor", () => {
  it("round trips and refuses another sort (acceptance 10)", () => {
    const raw = encodeCursor({ sort: "most-staked", tier: 0, value: (5n * E).toString(), id: 9 });
    expect(decodeCursor(raw, "most-staked")).toEqual({
      sort: "most-staked",
      tier: 0,
      value: (5n * E).toString(),
      id: 9,
    });
    expect(decodeCursor(raw, "newest")).toBeNull();
  });

  it("refuses malformed cursors", () => {
    expect(decodeCursor("not base64 json", "newest")).toBeNull();
    const badValue = encodeCursor({ sort: "most-staked", tier: 0, value: "1e5", id: 1 });
    expect(decodeCursor(badValue, "most-staked")).toBeNull();
    const badId = Buffer.from(JSON.stringify(["newest", 0, null, 0])).toString("base64url");
    expect(decodeCursor(badId, "newest")).toBeNull();
  });

  it("carries the value of the last row for each sort", () => {
    const last = row(7, { totalStakeWei: "7000000000000000000", nameKey: "Zebra", tier: 2 });
    expect(cursorAfter(last, "most-staked").value).toBe("7000000000000000000");
    expect(cursorAfter(last, "most-fans").value).toBe(7);
    expect(cursorAfter(last, "name-asc").value).toBe("Zebra");
    expect(cursorAfter(last, "newest")).toEqual({ sort: "newest", tier: 2, value: null, id: 7 });
  });
});

describe("parseSearch", () => {
  it("reads a full address as an exact address", () => {
    const address = `0x${"A".repeat(40)}`;
    expect(parseSearch(address)).toMatchObject({ kind: "address", text: address.toLowerCase() });
  });

  it("strips @ for the handle and boolean operators for FULLTEXT", () => {
    expect(parseSearch("  @Studio  ")).toMatchObject({
      kind: "text",
      text: "@Studio",
      handle: "studio",
      fulltext: "Studio*",
    });
    expect(parseSearch('+drop -"table" (x)').fulltext).toBe("drop* table*");
  });

  it("skips the description for terms under 3 characters", () => {
    expect(parseSearch("ab").fulltext).toBeNull();
    expect(parseSearch(undefined).kind).toBe("none");
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("pageQuery", () => {
  const base = {
    chainId: "73863",
    filter: "all" as const,
    sort: "newest" as const,
    limit: 24,
    term: parseSearch(undefined),
    cursor: null,
  };

  it("lists only visible pools of listed creators, limit plus one", () => {
    const q = pageQuery(base);
    expect(q.sql).toContain("cp.hidden = false");
    expect(q.sql).toContain("cp.poolAddress IS NOT NULL");
    expect(q.sql).toContain("u.block = 'no'");
    expect(q.values).toContain(25);
    expect(q.sql).not.toContain("tier ASC");
  });

  it("compares stake cursors at full precision", () => {
    const q = pageQuery({
      ...base,
      sort: "most-staked",
      cursor: { sort: "most-staked", tier: 0, value: (2n ** 200n).toString(), id: 3 },
    });
    expect(q.sql).toContain("CAST(? AS DECIMAL(65,0))");
    expect(q.values).toContain((2n ** 200n).toString());
  });

  it("filters on the stats columns", () => {
    expect(pageQuery({ ...base, filter: "no-fans" }).sql).toContain("cp.active_fans = 0");
    expect(pageQuery({ ...base, filter: "more-than-10-fans" }).sql).toContain(
      "cp.active_fans > 10"
    );
    const tenK = pageQuery({ ...base, filter: "more-than-10k-stake" });
    expect(tenK.values).toContain(TEN_K_STAKE_WEI);
  });

  it("orders a text search by tier first (decision P5) and searches the description (P2)", () => {
    const q = pageQuery({ ...base, sort: "most-fans", term: parseSearch("studio") });
    expect(q.sql).toMatch(/ORDER BY tier ASC, cp\.active_fans DESC, cp\.id DESC/);
    expect(q.sql).toContain("MATCH (cp.description) AGAINST (? IN BOOLEAN MODE)");
  });
});

describe("pools.list.listPools", () => {
  it("returns a page, the total on the first page, and a cursor when more exist", async () => {
    state.pageRows = Array.from({ length: 25 }, (_, i) => row(30 - i));
    state.total = 40;
    const page = await caller().listPools({ chainId: "73863" });
    expect(page.pools).toHaveLength(24);
    expect(page.total).toBe(40);
    expect(page.nextCursor).not.toBeNull();
    expect(page.pools[0]).toMatchObject({ id: 30, fans: 30, stakedAmount: 30n * E });

    state.queries.length = 0;
    state.pageRows = [row(3)];
    const next = await caller().listPools({ chainId: "73863", cursor: page.nextCursor! });
    expect(next.total).toBeNull();
    expect(next.nextCursor).toBeNull();
    expect(state.queries.some(q => q.sql.includes("COUNT(*)"))).toBe(false);
  });

  it("refuses a cursor from another sort", async () => {
    const raw = encodeCursor({ sort: "newest", tier: 0, value: null, id: 5 });
    await expect(
      caller().listPools({ chainId: "73863", sort: "most-fans", cursor: raw })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("serves the first page from cache until the list version changes", async () => {
    state.pageRows = [row(2), row(1)];
    state.total = 2;
    await caller().listPools({ chainId: "73863" });
    const firstRun = state.queries.length;
    const again = await caller().listPools({ chainId: "73863" });
    expect(state.queries.length).toBe(firstRun);
    expect(again.pools[0].stakedAmount).toBe(2n * E);

    // A stake bumps the version (poolStats.bumpPoolsListVersion)
    state.cache.set("pools:list:ver:73863", Date.now());
    await caller().listPools({ chainId: "73863" });
    expect(state.queries.length).toBeGreaterThan(firstRun);
  });

  it("never caches searches", async () => {
    state.pageRows = [row(1)];
    await caller().listPools({ chainId: "73863", search: "studio" });
    await caller().listPools({ chainId: "73863", search: "studio" });
    expect(state.queries.filter(q => !q.sql.includes("COUNT(*)"))).toHaveLength(2);
  });

  it("uses the cached live total, but fans always from the column (P3, P4)", async () => {
    const r = row(4, { activeFans: 2 });
    state.pageRows = [r];
    state.cache.set(`pools_public_data:73863:${r.poolAddress}`, {
      totalStake: (99n * E).toString(),
      fans: 3,
    });
    state.cache.set(`apy:73863:${r.poolAddress}`, 1250);
    const page = await caller().listPools({ chainId: "73863", search: "pool" });
    expect(page.pools[0]).toMatchObject({ stakedAmount: 99n * E, fans: 2, apy: 1250 });
  });

  it("never waits on APY: a miss returns none and schedules one refresh", async () => {
    const r = row(5);
    state.pageRows = [r];
    const page = await caller().listPools({ chainId: "73863", search: "pool five" });
    expect(page.pools[0].apy).toBeUndefined();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(vi.mocked(calculatePoolAPY)).toHaveBeenCalledWith(
      [r.poolAddress],
      73863,
      expect.anything()
    );
  });

  it("limits searches more tightly", async () => {
    await caller().listPools({ chainId: "73863" });
    await caller().listPools({ chainId: "73863", search: "abc" });
    expect(state.rateLimits[0].map(r => r.key)).toEqual(["pools-list:203.0.113.9"]);
    expect(state.rateLimits[1].map(r => r.key)).toContain("pools-search:203.0.113.9");
  });

  it("returns nothing for an unknown chain", async () => {
    const page = await caller().listPools({ chainId: "1" });
    expect(page).toEqual({ pools: [], nextCursor: null, total: 0 });
  });
});

describe("pools.list.sitemapPools", () => {
  it("lists every listed pool with a date, cached", async () => {
    state.pageRows = [{ address: "0xabc", updatedAt: new Date("2026-10-01T00:00:00Z") }];
    const first = await caller().sitemapPools({ chainId: "73863" });
    expect(first).toEqual([{ address: "0xabc", updatedAt: "2026-10-01T00:00:00.000Z" }]);
    state.pageRows = [];
    expect(await caller().sitemapPools({ chainId: "73863" })).toEqual(first);
  });
});
