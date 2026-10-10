/**
 * Messaging on Telegram (Build Board #2), spec 3.3: who passes each rule kind,
 * evaluated over Follow and StakedPool. PAID_MEMBER is false until Memberships ships.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  follow: { findMany: vi.fn() },
  userWallet: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  prisma: db,
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (values: unknown[]) => ({ join: values }),
  },
}));

import {
  creatorPoolIds,
  evaluateRule,
  passingUserIds,
  stakerIds,
} from "../services/telegram/rules";

const CREATOR = 10;
const ctx = { creatorUserId: CREATOR, poolIds: [5] };

describe("Telegram access rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.follow.findMany.mockResolvedValue([{ follower_id: 1 }]);
    // Stakers: user 2 above zero, user 3 above zero; with a minimum only user 3
    db.$queryRaw.mockImplementation(async (query: any) => {
      const sql = query.strings.join("?");
      if (sql.includes(">= CAST")) return [{ userId: 3 }];
      return [{ userId: 2 }, { userId: 3 }];
    });
  });

  it("ANYONE passes everyone except the creator", async () => {
    const passing = await passingUserIds("ANYONE", ctx, [1, 2, CREATOR, 9]);
    expect([...passing].sort()).toEqual([1, 2, 9]);
  });

  it("FOLLOWER passes followers and pool fans, the default door", async () => {
    const passing = await passingUserIds("FOLLOWER", ctx, [1, 2, 3, 9]);
    expect([...passing].sort()).toEqual([1, 2, 3]);
    expect(await evaluateRule("FOLLOWER", ctx, 9)).toEqual({
      allowed: false,
      reason: "not_follower",
    });
  });

  it("POOL_MEMBER passes stakers only and names the pool fan refusal", async () => {
    expect([...(await passingUserIds("POOL_MEMBER", ctx, [1, 2, 3]))].sort()).toEqual([2, 3]);
    expect(await evaluateRule("POOL_MEMBER", ctx, 1)).toEqual({
      allowed: false,
      reason: "not_pool_fan",
    });
  });

  it("STAKE_MIN compares the amount in SQL as a decimal and never returns it", async () => {
    const result = await stakerIds([5], [2, 3], "500");
    expect([...result]).toEqual([3]);
    const call = db.$queryRaw.mock.calls[0]![0];
    expect(call.strings.join("?")).toContain(
      "CAST(sp.stakeAmount AS DECIMAL(65,0)) >= CAST(? AS DECIMAL(65,0))"
    );
    expect(call.values).toContain("500");
    expect(await evaluateRule("STAKE_MIN", { ...ctx, stakeMin: "500" }, 2)).toEqual({
      allowed: false,
      reason: "stake_below",
    });
    expect(await evaluateRule("STAKE_MIN", { ...ctx, stakeMin: "500" }, 3)).toEqual({
      allowed: true,
    });
  });

  it("a non numeric minimum falls back to above zero rather than failing open or closed by accident", async () => {
    const result = await stakerIds([5], [2, 3], "500.5 tREVO");
    expect([...result].sort()).toEqual([2, 3]);
  });

  it("pool rules refuse with no_pool when the creator has no pool", async () => {
    const noPool = { creatorUserId: CREATOR, poolIds: [] };
    expect(await evaluateRule("POOL_MEMBER", noPool, 2)).toEqual({
      allowed: false,
      reason: "no_pool",
    });
    expect(await evaluateRule("STAKE_MIN", noPool, 2)).toEqual({
      allowed: false,
      reason: "no_pool",
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("PAID_MEMBER is false for everyone until Memberships (#25) ships", async () => {
    expect((await passingUserIds("PAID_MEMBER", ctx, [1, 2, 3])).size).toBe(0);
    expect(await evaluateRule("PAID_MEMBER", ctx, 2)).toEqual({
      allowed: false,
      reason: "not_member",
    });
  });

  it("the creator always passes their own rule", async () => {
    expect(await evaluateRule("STAKE_MIN", ctx, CREATOR)).toEqual({ allowed: true });
  });

  it("creatorPoolIds reads the creator's pools through their wallet", async () => {
    db.userWallet.findUnique.mockResolvedValue({ creatorPools: [{ id: 5 }, { id: 6 }] });
    expect(await creatorPoolIds(CREATOR)).toEqual([5, 6]);
    db.userWallet.findUnique.mockResolvedValue(null);
    expect(await creatorPoolIds(CREATOR)).toEqual([]);
  });

  it("only counts followers whose account counts (verified email, not suspended)", async () => {
    await passingUserIds("FOLLOWER", ctx, [1]);
    const where = db.follow.findMany.mock.calls[0]![0].where;
    expect(where.follower).toEqual({ email_verified: true, block: "no" });
  });
});
