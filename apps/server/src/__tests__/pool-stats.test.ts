/**
 * Pool list stats (Build Board D7, PL1). docs/features/pools-list-paging.md 3.1 and 3.2.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePoolsDb, FakeDecimal } from "./helpers/fakePoolsDb";

const db = vi.hoisted(() => ({ current: null as any }));
const cacheSets = vi.hoisted(() => [] as { key: string; value: unknown }[]);

vi.mock("@repo/database", () => ({
  get prisma() {
    return db.current.client;
  },
  Prisma: { Decimal: FakeDecimal },
}));

vi.mock("../utils/cache", () => ({
  cache: {
    set: vi.fn(async (key: string, value: unknown) => {
      cacheSets.push({ key, value });
    }),
    get: vi.fn(async () => null),
  },
}));

vi.mock("@repo/web3", () => ({
  CREATOR_POOL_ABI: [],
  getChainConfig: () => null,
  getRpcTransport: () => null,
  getPoolName: async () => null,
}));

import {
  applyStakeDelta,
  computePoolStats,
  decimalToWei,
  poolsListVersionKey,
  recomputePoolStats,
} from "../services/poolStats";
import { backfillPoolStats } from "../services/poolStatsBackfill";

const E = 10n ** 18n;
const CREATOR = 1;
const FAN_A = 2;
const FAN_B = 3;

function stats(poolId: number) {
  const pool = db.current.pools.get(poolId);
  return {
    creator: decimalToWei(pool.creatorStakeWei),
    fan: decimalToWei(pool.fanStakeWei),
    total: decimalToWei(pool.totalStakeWei),
    fans: pool.activeFans,
    updated: pool.statsUpdatedAt,
  };
}

beforeEach(() => {
  db.current = createFakePoolsDb();
  cacheSets.length = 0;
});

describe("computePoolStats", () => {
  it("excludes the creator's wallet from fans and fan stake (P4)", () => {
    const result = computePoolStats(
      [
        { userWalletId: CREATOR, stakeAmount: (5n * E).toString() },
        { userWalletId: FAN_A, stakeAmount: (2n * E).toString() },
        { userWalletId: FAN_B, stakeAmount: "0" },
      ],
      CREATOR,
      { chain: 100n * E }
    );
    expect(result).toEqual({
      creatorStakeWei: 100n * E,
      fanStakeWei: 2n * E,
      totalStakeWei: 102n * E,
      activeFans: 1,
    });
  });

  it("falls back to the launch stake plus the creator's own row", () => {
    const result = computePoolStats(
      [{ userWalletId: CREATOR, stakeAmount: (5n * E).toString() }],
      CREATOR,
      { chain: null, launchStake: 100n * E }
    );
    expect(result.creatorStakeWei).toBe(105n * E);
    expect(result.totalStakeWei).toBe(105n * E);
    expect(result.activeFans).toBe(0);
  });

  it("reads bad stored amounts as zero and keeps uint256 precision", () => {
    const huge = 2n ** 200n;
    const result = computePoolStats(
      [
        { userWalletId: FAN_A, stakeAmount: "not a number" },
        { userWalletId: FAN_B, stakeAmount: huge.toString() },
      ],
      CREATOR,
      { chain: 0n }
    );
    expect(result.fanStakeWei).toBe(huge);
    expect(result.activeFans).toBe(1);
  });
});

describe("decimalToWei", () => {
  it("never goes through Number", () => {
    expect(decimalToWei(new FakeDecimal("123456789012345678901234567890") as any)).toBe(
      123456789012345678901234567890n
    );
    expect(decimalToWei(null)).toBe(0n);
  });
});

describe("recomputePoolStats", () => {
  it("uses the launch event on the first write, then keeps the stored creator stake", async () => {
    db.current.addPool({ id: 10, walletId: CREATOR });
    db.current.addEvent({
      userWalletId: CREATOR,
      poolId: 10,
      amount: (50n * E).toString(),
      eventType: "create",
      transactionHash: "0xc",
    });
    db.current.addStake(FAN_A, 10, 3n * E);

    await recomputePoolStats(db.current.client, 10);
    expect(stats(10)).toMatchObject({ creator: 50n * E, fan: 3n * E, total: 53n * E, fans: 1 });

    // A chain read replaces the creator stake
    await recomputePoolStats(db.current.client, 10, { creatorStaked: 60n * E });
    expect(stats(10).total).toBe(63n * E);

    // No chain value: the stored creator stake stays
    await recomputePoolStats(db.current.client, 10);
    expect(stats(10).creator).toBe(60n * E);
  });

  it("returns null for a missing pool", async () => {
    expect(await recomputePoolStats(db.current.client, 999)).toBeNull();
  });
});

describe("applyStakeDelta", () => {
  beforeEach(() => {
    db.current.addPool({ id: 20, walletId: CREATOR, chainId: "73863" });
  });

  it("adds a stake, records one event and bumps the list version", async () => {
    const result = await applyStakeDelta({
      userWalletId: FAN_A,
      poolId: 20,
      amount: 4n * E,
      eventType: "stake",
      transactionHash: "0x1",
    });
    expect(result).toEqual({ applied: true, stakeAmount: 4n * E });
    expect(stats(20)).toMatchObject({ fan: 4n * E, total: 4n * E, fans: 1 });
    expect(db.current.events).toHaveLength(1);
    expect(cacheSets.map(c => c.key)).toContain(poolsListVersionKey("73863"));
  });

  it("never counts a replayed hash twice", async () => {
    const input = {
      userWalletId: FAN_A,
      poolId: 20,
      amount: 4n * E,
      eventType: "stake" as const,
      transactionHash: "0x1",
    };
    await applyStakeDelta(input);
    const again = await applyStakeDelta(input);
    expect(again.applied).toBe(false);
    expect(stats(20).fan).toBe(4n * E);
    expect(db.current.events).toHaveLength(1);
  });

  it("counts two confirms at the same moment (acceptance 8)", async () => {
    await Promise.all([
      applyStakeDelta({
        userWalletId: FAN_A,
        poolId: 20,
        amount: 1n * E,
        eventType: "stake",
        transactionHash: "0xa",
      }),
      applyStakeDelta({
        userWalletId: FAN_A,
        poolId: 20,
        amount: 2n * E,
        eventType: "stake",
        transactionHash: "0xb",
      }),
    ]);
    expect(stats(20)).toMatchObject({ fan: 3n * E, fans: 1 });
  });

  it("unstakes, and a fan at zero stops counting", async () => {
    await applyStakeDelta({
      userWalletId: FAN_A,
      poolId: 20,
      amount: 4n * E,
      eventType: "stake",
      transactionHash: "0x1",
    });
    await applyStakeDelta({
      userWalletId: FAN_A,
      poolId: 20,
      amount: 4n * E,
      eventType: "unstake",
      transactionHash: "0x2",
    });
    expect(stats(20)).toMatchObject({ fan: 0n, fans: 0 });
  });

  it("refuses an unstake above the stake and rolls the event back", async () => {
    await applyStakeDelta({
      userWalletId: FAN_A,
      poolId: 20,
      amount: 1n * E,
      eventType: "stake",
      transactionHash: "0x1",
    });
    await expect(
      applyStakeDelta({
        userWalletId: FAN_A,
        poolId: 20,
        amount: 2n * E,
        eventType: "unstake",
        transactionHash: "0x2",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.current.events).toHaveLength(1);
    expect(stats(20).fan).toBe(1n * E);
  });

  it("a creator stake through the stake flow is not a fan", async () => {
    await applyStakeDelta({
      userWalletId: CREATOR,
      poolId: 20,
      amount: 7n * E,
      eventType: "stake",
      transactionHash: "0x3",
    });
    expect(stats(20)).toMatchObject({ fans: 0, fan: 0n, creator: 7n * E, total: 7n * E });
  });
});

describe("backfillPoolStats", () => {
  beforeEach(() => {
    db.current.addPool({
      id: 30,
      walletId: CREATOR,
      name: null,
      revoStaked: (12n * E).toString(),
      fans: 3,
    });
    db.current.addEvent({
      userWalletId: CREATOR,
      poolId: 30,
      amount: (10n * E).toString(),
      eventType: "create",
      transactionHash: "0xc",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    });
    db.current.addStake(CREATOR, 30, 1n * E);
    db.current.addStake(FAN_A, 30, 2n * E);
  });

  const reads = {
    readCreatorStakes: async (_chain: string, addresses: string[]) => addresses.map(() => 10n * E),
    readPoolName: async () => "Studio Circle",
  };

  it("dry run reports and writes nothing", async () => {
    const lines: string[] = [];
    const rows = await backfillPoolStats({ apply: false, log: l => lines.push(l), ...reads });
    expect(rows[0]).toMatchObject({
      newTotal: (12n * E).toString(),
      oldFans: 3,
      newFans: 1,
      nameFilled: true,
    });
    expect(db.current.pools.get(30).statsUpdatedAt).toBeNull();
    expect(db.current.pools.get(30).name).toBeNull();
    expect(lines.join("\n")).toContain("dry run");
  });

  it("apply writes stats, name and createdAt, and is idempotent", async () => {
    await backfillPoolStats({ apply: true, log: () => undefined, ...reads });
    const first = { ...stats(30) };
    expect(first).toMatchObject({ creator: 10n * E, fan: 2n * E, total: 12n * E, fans: 1 });
    expect(db.current.pools.get(30).name).toBe("Studio Circle");
    expect(db.current.pools.get(30).createdAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");

    await backfillPoolStats({ apply: true, log: () => undefined, ...reads });
    expect(stats(30)).toMatchObject({
      creator: first.creator,
      fan: first.fan,
      total: first.total,
      fans: first.fans,
    });
  });

  it("uses the launch stake when the chain read fails", async () => {
    await backfillPoolStats({
      apply: true,
      log: () => undefined,
      readCreatorStakes: async () => {
        throw new Error("rpc down");
      },
      readPoolName: async () => null,
    });
    // launch 10 plus the creator's own row 1
    expect(stats(30)).toMatchObject({ creator: 11n * E, total: 13n * E });
  });
});
