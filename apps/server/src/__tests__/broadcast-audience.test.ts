/**
 * Broadcast audiences (Amped Messages M9, spec 6, bc-audience and bc-email).
 * The access engine and the database are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stakers: [] as number[],
  followers: [] as number[],
  followBlocks: [] as number[],
  theyBlocked: [] as number[],
  iBlocked: [] as number[][],
  consent: [] as number[],
  calls: [] as Array<{ kind: string; options: unknown }>,
}));

vi.mock("../services/access/engine", () => ({
  eligibleUserIds: vi.fn(
    async (
      rule: { kind: string },
      _owner: number,
      page: { cursor?: number | null; limit?: number },
      options: unknown
    ) => {
      state.calls.push({ kind: rule.kind, options });
      const all = rule.kind === "pool_member" ? state.stakers : state.followers;
      // Two pages of 2 to prove paging runs to the end
      const after = page.cursor ?? 0;
      const rest = all.filter(id => id > after);
      const userIds = rest.slice(0, 2);
      return { userIds, nextCursor: rest.length > 2 ? userIds.at(-1)! : null };
    }
  ),
}));

vi.mock("@repo/database", () => ({
  prisma: {
    followBlock: {
      findMany: vi.fn(async () => state.followBlocks.map(user_id => ({ user_id }))),
    },
    conversationMember: {
      findMany: vi.fn(async ({ where }: { where: { userId?: unknown } }) =>
        typeof where.userId === "number"
          ? state.iBlocked.map(ids => ({
              conversation: { members: ids.map(userId => ({ userId })) },
            }))
          : state.theyBlocked.map(userId => ({ userId }))
      ),
    },
    follow: {
      findMany: vi.fn(async ({ where }: { where: { follower_id: { in: number[] } } }) =>
        state.consent
          .filter(id => where.follower_id.in.includes(id))
          .map(follower_id => ({ follower_id }))
      ),
    },
    creatorPool: { findFirst: vi.fn() },
  },
}));

import { audienceCounts, resolveAudience } from "../services/broadcast/audience";

const CREATOR = 1;

beforeEach(() => {
  Object.assign(state, {
    stakers: [],
    followers: [],
    followBlocks: [],
    theyBlocked: [],
    iBlocked: [],
    consent: [],
    calls: [],
  });
});

describe("resolveAudience", () => {
  it("pool stakers only, across pages, outside the stake pilot allowlist", async () => {
    state.stakers = [2, 3, 4, 5, 6];
    state.followers = [7];
    const a = await resolveAudience("POOL_MEMBERS", CREATOR, 9);
    expect(a.userIds).toEqual([2, 3, 4, 5, 6]);
    expect(state.calls.every(c => c.kind === "pool_member")).toBe(true);
    expect(state.calls[0]!.options).toEqual({ stakeAllowlist: false });
  });

  it("followers only, without a pool", async () => {
    state.followers = [7, 8];
    const a = await resolveAudience("FOLLOWERS", CREATOR, null);
    expect(a.userIds).toEqual([7, 8]);
    expect(a.pool).toBe(0);
    expect(state.calls.map(c => c.kind)).toEqual(["follower"]);
  });

  it("Both: one entry per person who follows and stakes", async () => {
    state.stakers = [2, 3, 4];
    state.followers = [3, 4, 5];
    const a = await resolveAudience("POOL_AND_FOLLOWERS", CREATOR, 9);
    expect(a.userIds).toEqual([2, 3, 4, 5]);
    expect([...a.poolIds]).toEqual([2, 3, 4]);
    expect({ pool: a.pool, followers: a.followers }).toEqual({ pool: 3, followers: 3 });
  });

  it("an audience with the pool and no pool id has no stakers", async () => {
    state.stakers = [2];
    state.followers = [5];
    expect((await resolveAudience("POOL_AND_FOLLOWERS", CREATOR, null)).userIds).toEqual([5]);
  });

  it("leaves out the creator, follow blocks and Messages blocks both ways", async () => {
    state.stakers = [CREATOR, 2, 3];
    state.followers = [4, 5, 6];
    state.followBlocks = [2];
    state.theyBlocked = [4];
    state.iBlocked = [[CREATOR, 5]];
    const a = await resolveAudience("POOL_AND_FOLLOWERS", CREATOR, 9);
    expect(a.userIds).toEqual([3, 6]);
  });

  it("email consent is Follow.email_updates for this creator (bc-email)", async () => {
    state.followers = [7, 8, 9];
    state.consent = [8, 99];
    const a = await resolveAudience("FOLLOWERS", CREATOR, null);
    expect([...a.emailConsent]).toEqual([8]);
  });
});

describe("audienceCounts", () => {
  it("returns pool, followers and the deduplicated total", async () => {
    state.stakers = [2, 3];
    state.followers = [3, 4, 5];
    expect(await audienceCounts(CREATOR, 9)).toEqual({ pool: 2, followers: 3, total: 4 });
  });
});
