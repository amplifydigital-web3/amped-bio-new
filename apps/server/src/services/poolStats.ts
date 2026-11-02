/**
 * Pool list stats (Build Board D7, docs/features/pools-list-paging.md section 3.1).
 *
 * The one writer of CreatorPool.creatorStakeWei, fanStakeWei, totalStakeWei,
 * activeFans and statsUpdatedAt. Every path that changes a StakedPool row, or
 * learns the creator's stake from the chain, calls recomputePoolStats so the
 * pool list can sort and filter in SQL.
 */
import { prisma, Prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import { cache } from "../utils/cache";

/** The client inside prisma.$transaction (the extended client's own type). */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface PoolStats {
  creatorStakeWei: bigint;
  fanStakeWei: bigint;
  totalStakeWei: bigint;
  activeFans: number;
}

export interface StakeRow {
  userWalletId: number;
  stakeAmount: string;
}

/** Parses a stored wei amount. Bad or empty text reads as zero. */
export function toWei(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/** Prisma.Decimal (DECIMAL(65,0)) to bigint, never through Number. */
export function decimalToWei(value: Prisma.Decimal | string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  const text = typeof value === "string" ? value : value.toFixed(0);
  return toWei(text.split(".")[0]);
}

/**
 * Pure stats from a pool's stake rows. The creator's wallet never counts as a
 * fan (decision P4). creatorStakeWei is the chain value when known; otherwise
 * the fallback is the launch stake plus the creator wallet's own row.
 */
export function computePoolStats(
  rows: StakeRow[],
  creatorWalletId: number,
  creatorStake: { chain?: bigint | null; launchStake?: bigint | null }
): PoolStats {
  let fanStakeWei = 0n;
  let activeFans = 0;
  let creatorRow = 0n;
  for (const row of rows) {
    const amount = toWei(row.stakeAmount);
    if (row.userWalletId === creatorWalletId) {
      if (amount > 0n) creatorRow += amount;
      continue;
    }
    if (amount > 0n) {
      fanStakeWei += amount;
      activeFans += 1;
    }
  }
  const creatorStakeWei =
    creatorStake.chain !== undefined && creatorStake.chain !== null
      ? creatorStake.chain
      : (creatorStake.launchStake ?? 0n) + creatorRow;
  return {
    creatorStakeWei,
    fanStakeWei,
    totalStakeWei: creatorStakeWei + fanStakeWei,
    activeFans,
  };
}

export interface RecomputeOptions {
  /** The creator's stake read from the chain (creatorStaked). */
  creatorStaked?: bigint | null;
}

export interface LockedPool {
  walletId: number;
  chainId: string;
  creatorStakeWei: Prisma.Decimal | string | number | null;
  statsUpdatedAt: Date | null;
}

/**
 * Locks the pool row (SELECT ... FOR UPDATE) inside `tx` and returns what the
 * stats writer needs. Every transaction that writes stake rows or stats for a
 * pool takes this lock before anything else, so writers for one pool run one
 * at a time and each reads the stake rows committed before it. Without it, two
 * stake transactions both take the shared foreign key lock on the pool row
 * (inserting a stake_events row) and then deadlock when both update the pool.
 */
export async function lockPoolForStats(tx: Tx, poolId: number): Promise<LockedPool | null> {
  const rows = await tx.$queryRaw<
    LockedPool[]
  >`SELECT walletId, chainId, creator_stake_wei AS creatorStakeWei, stats_updated_at AS statsUpdatedAt FROM creator_pools WHERE id = ${poolId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Recomputes and writes the stats columns for one pool inside `tx`.
 *
 * When no chain value is passed, the stored creatorStakeWei is kept once the
 * stats have been written (statsUpdatedAt set). On the first write the launch
 * stake plus the creator wallet's row is used; a later chain read replaces it.
 */
export async function recomputePoolStats(
  tx: Tx,
  poolId: number,
  options: RecomputeOptions = {}
): Promise<(PoolStats & { chainId: string }) | null> {
  const pool = await lockPoolForStats(tx, poolId);
  if (!pool) return null;

  const rows = await tx.stakedPool.findMany({
    where: { poolId },
    select: { userWalletId: true, stakeAmount: true },
  });

  let chain: bigint | null = options.creatorStaked ?? null;
  let launchStake: bigint | null = null;
  if (chain === null) {
    if (pool.statsUpdatedAt) {
      chain = decimalToWei(pool.creatorStakeWei);
    } else {
      const launch = await tx.stakeEvent.findFirst({
        where: { poolId, eventType: "create" },
        select: { amount: true },
      });
      launchStake = toWei(launch?.amount);
    }
  }

  const stats = computePoolStats(rows, pool.walletId, { chain, launchStake });
  await tx.creatorPool.update({
    where: { id: poolId },
    data: {
      creatorStakeWei: new Prisma.Decimal(stats.creatorStakeWei.toString()),
      fanStakeWei: new Prisma.Decimal(stats.fanStakeWei.toString()),
      totalStakeWei: new Prisma.Decimal(stats.totalStakeWei.toString()),
      activeFans: stats.activeFans,
      statsUpdatedAt: new Date(),
    },
  });
  return { ...stats, chainId: pool.chainId };
}

/** Redis key read by the pool list first page cache (PL2). */
export function poolsListVersionKey(chainId: string): string {
  return `pools:list:ver:${chainId}`;
}

/**
 * Marks the cached pool list pages for a chain as stale. The list cache keys
 * include this version, so a write is visible on the next request.
 */
export async function bumpPoolsListVersion(chainId: string): Promise<void> {
  try {
    await cache.set(poolsListVersionKey(chainId), Date.now(), 7 * 24 * 3600);
  } catch (error) {
    console.warn("[poolStats] could not bump the pool list version", error);
  }
}

/** Recompute in its own transaction, then bump the list version. */
export async function refreshPoolStats(poolId: number, options: RecomputeOptions = {}) {
  const result = await prisma.$transaction(tx => recomputePoolStats(tx, poolId, options));
  if (result) await bumpPoolsListVersion(result.chainId);
  return result;
}

/** Best effort refresh for read paths: logs and never throws. */
export async function refreshPoolStatsQuietly(poolId: number, options: RecomputeOptions = {}) {
  try {
    await refreshPoolStats(poolId, options);
  } catch (error) {
    console.error(`[poolStats] refresh failed for pool ${poolId}`, error);
  }
}

export interface StakeDeltaInput {
  userWalletId: number;
  poolId: number;
  /** Positive amount in wei. */
  amount: bigint;
  eventType: "stake" | "unstake";
  transactionHash: string;
}

/**
 * Applies one confirmed stake or unstake in a single transaction:
 * writes the StakeEvent (once per hash, wallet and pool), locks the wallet's
 * StakedPool row, adds or subtracts the amount, and recomputes the pool stats.
 *
 * A hash already recorded applies nothing and returns applied false, so a
 * replayed confirm never counts twice. Two confirms at the same moment both
 * count, because the pool row is locked first and then the wallet's row is
 * locked before it is read.
 */
export async function applyStakeDelta(
  input: StakeDeltaInput
): Promise<{ applied: boolean; stakeAmount: bigint }> {
  const result = await prisma.$transaction(async tx => {
    // Pool row first: serializes every stake and stats write for the pool and
    // avoids the foreign key lock upgrade deadlock (see lockPoolForStats)
    const pool = await lockPoolForStats(tx, input.poolId);
    if (!pool) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Pool ${input.poolId} not found` });
    }

    const inserted = await tx.stakeEvent.createMany({
      data: [
        {
          userWalletId: input.userWalletId,
          poolId: input.poolId,
          amount: input.amount.toString(),
          eventType: input.eventType,
          transactionHash: input.transactionHash,
        },
      ],
      skipDuplicates: true,
    });

    // Make sure the row exists, then lock it before reading the amount.
    await tx.$executeRaw`INSERT IGNORE INTO staked_pools (userWalletId, poolId, stakeAmount) VALUES (${input.userWalletId}, ${input.poolId}, '0')`;
    const locked = await tx.$queryRaw<
      { stakeAmount: string }[]
    >`SELECT stakeAmount FROM staked_pools WHERE userWalletId = ${input.userWalletId} AND poolId = ${input.poolId} FOR UPDATE`;
    const existing = toWei(locked[0]?.stakeAmount);

    if (inserted.count === 0) {
      return { applied: false, stakeAmount: existing, chainId: null as string | null };
    }

    let next: bigint;
    if (input.eventType === "stake") {
      next = existing + input.amount;
    } else {
      if (existing < input.amount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unstake amount exceeds current stake. Current stake: ${existing}, Requested unstake: ${input.amount}`,
        });
      }
      next = existing - input.amount;
    }

    await tx.stakedPool.update({
      where: { userWalletId_poolId: { userWalletId: input.userWalletId, poolId: input.poolId } },
      data: { stakeAmount: next.toString(), updatedAt: new Date() },
    });
    // The creator's own stake moves the creator stake, never the fan stake (P4).
    // Once stats exist the stored creator stake is kept between chain reads, so
    // the delta is applied to it here; before the first write the fallback
    // (launch stake plus this row) already includes it.
    let creatorStaked: bigint | undefined;
    if (input.userWalletId === pool.walletId && pool.statsUpdatedAt) {
      const stored = decimalToWei(pool.creatorStakeWei);
      if (input.eventType === "stake") {
        creatorStaked = stored + input.amount;
      } else {
        creatorStaked = stored > input.amount ? stored - input.amount : 0n;
      }
    }

    const stats = await recomputePoolStats(tx, input.poolId, { creatorStaked });
    return { applied: true, stakeAmount: next, chainId: stats?.chainId ?? pool.chainId };
  });

  if (result.chainId) await bumpPoolsListVersion(result.chainId);
  return { applied: result.applied, stakeAmount: result.stakeAmount };
}
