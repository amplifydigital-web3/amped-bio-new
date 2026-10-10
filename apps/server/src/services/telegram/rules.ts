import { Prisma, prisma } from "@repo/database";
import type { DmRuleKind } from "@repo/constants";

/**
 * Messaging on Telegram (Build Board #2), spec 3.3 and 3.6. Who may message a creator
 * or sit in a creator's group, evaluated against the models that exist today:
 * `Follow` (Fan Graph) and `StakedPool` (pool fans). There is no gating engine in the
 * repo (spec 3.15, finding 3); when #21 ships, this module becomes a thin call into it.
 *
 * PAID_MEMBER is Memberships (#25). Until that build lands there are no paid members,
 * so the rule evaluates to false and the UI hides the tile behind its flag.
 *
 * Nothing here returns an amount to a caller that renders public copy: `stakeMin`
 * comparison happens in SQL and only the boolean leaves this module.
 */

export type RuleRefusal =
  | "not_follower"
  | "not_member"
  | "not_pool_fan"
  | "stake_below"
  | "no_pool";

export type RuleContext = {
  creatorUserId: number;
  /** The creator's pools (CreatorPool ids). Empty when the creator has none. */
  poolIds: number[];
  /** tREVO as a decimal string, STAKE_MIN only */
  stakeMin?: string | null;
};

export type RuleResult = { allowed: true } | { allowed: false; reason: RuleRefusal };

/** Only follows from accounts that count: verified email, not suspended (trpc/follow.ts). */
const COUNTED_FOLLOWER: Prisma.UserWhereInput = { email_verified: true, block: "no" };

/** Pools owned by a creator, through their wallet. */
export async function creatorPoolIds(creatorUserId: number): Promise<number[]> {
  const wallet = await prisma.userWallet.findUnique({
    where: { userId: creatorUserId },
    select: { creatorPools: { select: { id: true } } },
  });
  return wallet?.creatorPools.map(pool => pool.id) ?? [];
}

/** Batch: which of `userIds` follow the creator with an account that counts. */
export async function followerIds(creatorUserId: number, userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.follow.findMany({
    where: { creator_id: creatorUserId, follower_id: { in: userIds }, follower: COUNTED_FOLLOWER },
    select: { follower_id: true },
  });
  return new Set(rows.map(row => row.follower_id));
}

/**
 * Batch: which of `userIds` hold a stake of at least `stakeMin` (default: above zero) in
 * any of `poolIds`. stakeAmount is Text, so the comparison casts to DECIMAL(65,0) the
 * same way services/broadcast/index.ts counts members.
 */
export async function stakerIds(
  poolIds: number[],
  userIds: number[],
  stakeMin?: string | null
): Promise<Set<number>> {
  if (poolIds.length === 0 || userIds.length === 0) return new Set();
  const minimum = stakeMin && /^\d+$/.test(stakeMin) ? stakeMin : null;
  const rows = minimum
    ? await prisma.$queryRaw<Array<{ userId: number }>>(Prisma.sql`
        SELECT DISTINCT uw.userId AS userId
        FROM staked_pools sp
        JOIN user_wallets uw ON sp.userWalletId = uw.id
        JOIN users u ON u.id = uw.userId
        WHERE sp.poolId IN (${Prisma.join(poolIds)})
          AND uw.userId IN (${Prisma.join(userIds)})
          AND CAST(sp.stakeAmount AS DECIMAL(65,0)) >= CAST(${minimum} AS DECIMAL(65,0))
          AND u.block = 'no'
      `)
    : await prisma.$queryRaw<Array<{ userId: number }>>(Prisma.sql`
        SELECT DISTINCT uw.userId AS userId
        FROM staked_pools sp
        JOIN user_wallets uw ON sp.userWalletId = uw.id
        JOIN users u ON u.id = uw.userId
        WHERE sp.poolId IN (${Prisma.join(poolIds)})
          AND uw.userId IN (${Prisma.join(userIds)})
          AND CAST(sp.stakeAmount AS DECIMAL(65,0)) > 0
          AND u.block = 'no'
      `);
  return new Set(rows.map(row => Number(row.userId)));
}

/** Memberships (#25) is not built. No user is a paid member until it ships. */
export async function paidMemberIds(
  _creatorUserId: number,
  _userIds: number[]
): Promise<Set<number>> {
  return new Set();
}

/**
 * Batch evaluation: the subset of `userIds` that pass `rule` for the creator in `ctx`.
 * FOLLOWER means followers, paid members or pool fans (the default door).
 */
export async function passingUserIds(
  rule: DmRuleKind,
  ctx: RuleContext,
  userIds: number[]
): Promise<Set<number>> {
  const ids = Array.from(new Set(userIds)).filter(id => id !== ctx.creatorUserId);
  if (ids.length === 0) return new Set();
  switch (rule) {
    case "ANYONE":
      return new Set(ids);
    case "FOLLOWER": {
      const [followers, stakers, paid] = await Promise.all([
        followerIds(ctx.creatorUserId, ids),
        stakerIds(ctx.poolIds, ids),
        paidMemberIds(ctx.creatorUserId, ids),
      ]);
      return new Set(ids.filter(id => followers.has(id) || stakers.has(id) || paid.has(id)));
    }
    case "PAID_MEMBER":
      return paidMemberIds(ctx.creatorUserId, ids);
    case "POOL_MEMBER":
      return stakerIds(ctx.poolIds, ids);
    case "STAKE_MIN":
      return stakerIds(ctx.poolIds, ids, ctx.stakeMin);
  }
}

/** One user against one rule, with the refusal reason the bot and the page name. */
export async function evaluateRule(
  rule: DmRuleKind,
  ctx: RuleContext,
  userId: number
): Promise<RuleResult> {
  if (userId === ctx.creatorUserId) return { allowed: true };
  if ((rule === "POOL_MEMBER" || rule === "STAKE_MIN") && ctx.poolIds.length === 0) {
    return { allowed: false, reason: "no_pool" };
  }
  const passing = await passingUserIds(rule, ctx, [userId]);
  if (passing.has(userId)) return { allowed: true };
  switch (rule) {
    case "ANYONE":
      return { allowed: true };
    case "FOLLOWER":
      return { allowed: false, reason: "not_follower" };
    case "PAID_MEMBER":
      return { allowed: false, reason: "not_member" };
    case "POOL_MEMBER":
      return { allowed: false, reason: "not_pool_fan" };
    case "STAKE_MIN":
      return { allowed: false, reason: "stake_below" };
  }
}
