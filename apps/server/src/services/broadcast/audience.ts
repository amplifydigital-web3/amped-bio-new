/**
 * Broadcast audiences (Amped Messages M9, spec 6 and decisions bc-audience, bc-email).
 *
 * A broadcast goes to pool stakers, followers, or both. The audience is frozen with the
 * access engine's `eligibleUserIds` (gating spec 3.2): pool stakers through `pool_member`
 * on the creator's own pool, followers through `follower` (the 30 day email grace rule).
 * One delivery per person: the union is deduplicated here, and
 * `BroadcastDelivery @@unique([broadcastId, userId])` holds it in the database.
 *
 * Nobody blocked receives it: a FollowBlock by the creator, or a Messages block either
 * way (the recipient blocked the creator or the creator blocked the recipient). The
 * creator never receives their own broadcast.
 */
import { prisma } from "@repo/database";
import type { BroadcastAudienceKind } from "@repo/database";
import { eligibleUserIds } from "../access/engine";

const PAGE = 1000;

export const AUDIENCE_HAS_POOL: Record<BroadcastAudienceKind, boolean> = {
  POOL_MEMBERS: true,
  FOLLOWERS: false,
  POOL_AND_FOLLOWERS: true,
};

export const AUDIENCE_HAS_FOLLOWERS: Record<BroadcastAudienceKind, boolean> = {
  POOL_MEMBERS: false,
  FOLLOWERS: true,
  POOL_AND_FOLLOWERS: true,
};

type Rule = Parameters<typeof eligibleUserIds>[0];

async function allPages(rule: Rule, ownerUserId: number): Promise<number[]> {
  const ids: number[] = [];
  let cursor: number | null = null;
  do {
    // stakeAllowlist false: a broadcast opens nothing, so the counsel pilot that gates
    // stake access does not apply (pool broadcasts were open to every pool owner)
    const page = await eligibleUserIds(
      rule,
      ownerUserId,
      { cursor, limit: PAGE },
      { stakeAllowlist: false }
    );
    ids.push(...page.userIds);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return ids;
}

/** People the creator blocked from following, and Messages blocks in either direction. */
export async function blockedUserIds(creatorUserId: number): Promise<Set<number>> {
  const [followBlocks, theirBlocks, myBlocks] = await Promise.all([
    prisma.followBlock.findMany({
      where: { creator_id: creatorUserId },
      select: { user_id: true },
    }),
    // The recipient blocked the creator in a conversation the creator is in
    prisma.conversationMember.findMany({
      where: {
        state: "BLOCKED",
        userId: { not: creatorUserId },
        conversation: { members: { some: { userId: creatorUserId } } },
      },
      select: { userId: true },
    }),
    // The creator blocked the other member
    prisma.conversationMember.findMany({
      where: { userId: creatorUserId, state: "BLOCKED" },
      select: { conversation: { select: { members: { select: { userId: true } } } } },
    }),
  ]);
  const blocked = new Set<number>();
  for (const row of followBlocks) blocked.add(row.user_id);
  for (const row of theirBlocks) blocked.add(row.userId);
  for (const row of myBlocks) {
    for (const member of row.conversation.members) {
      if (member.userId !== creatorUserId) blocked.add(member.userId);
    }
  }
  return blocked;
}

export type Audience = {
  /** Everyone who gets the broadcast, deduplicated, blocks removed */
  userIds: number[];
  /** Follower ids who ticked email updates for this creator (bc-email) */
  emailConsent: Set<number>;
  /** Pool stakers in this audience (they keep their stake time email opt in) */
  poolIds: Set<number>;
  pool: number;
  followers: number;
};

/**
 * The frozen audience for one broadcast. `poolId` is required when the audience
 * includes the pool; a pool the creator does not own yields no stakers.
 */
export async function resolveAudience(
  kind: BroadcastAudienceKind,
  creatorUserId: number,
  poolId: number | null
): Promise<Audience> {
  const [stakers, followers, blocked] = await Promise.all([
    AUDIENCE_HAS_POOL[kind] && poolId !== null
      ? allPages({ kind: "pool_member", params: { poolId } }, creatorUserId)
      : Promise.resolve([] as number[]),
    AUDIENCE_HAS_FOLLOWERS[kind]
      ? allPages({ kind: "follower", params: {} }, creatorUserId)
      : Promise.resolve([] as number[]),
    blockedUserIds(creatorUserId),
  ]);
  const keep = (id: number) => id !== creatorUserId && !blocked.has(id);
  const poolSet = new Set(stakers.filter(keep));
  const followerSet = new Set(followers.filter(keep));
  const all = new Set([...poolSet, ...followerSet]);

  const emailConsent = new Set<number>();
  if (followerSet.size > 0) {
    const ids = [...followerSet];
    for (let i = 0; i < ids.length; i += PAGE) {
      const rows = await prisma.follow.findMany({
        where: {
          creator_id: creatorUserId,
          email_updates: true,
          follower_id: { in: ids.slice(i, i + PAGE) },
        },
        select: { follower_id: true },
      });
      for (const row of rows) emailConsent.add(row.follower_id);
    }
  }

  return {
    userIds: [...all].sort((a, b) => a - b),
    emailConsent,
    poolIds: poolSet,
    pool: poolSet.size,
    followers: followerSet.size,
  };
}

/** Counts for the composer: pool stakers, followers, and both deduplicated. */
export async function audienceCounts(creatorUserId: number, poolId: number | null) {
  const both = await resolveAudience("POOL_AND_FOLLOWERS", creatorUserId, poolId);
  return { pool: both.pool, followers: both.followers, total: both.userIds.length };
}

/** The creator's own pool, if any (any chain; the newest first). */
export async function creatorPoolId(creatorUserId: number, chainId?: string) {
  const pool = await prisma.creatorPool.findFirst({
    where: { wallet: { userId: creatorUserId }, ...(chainId ? { chainId } : {}) },
    orderBy: { id: "desc" },
    select: { id: true, name: true },
  });
  return pool;
}
