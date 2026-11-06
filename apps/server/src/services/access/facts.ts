/**
 * Facts the kind evaluators read (gating spec 3.3 and 3.8). Stakes are only ever
 * read: no transaction, no signature, no state changing call (Rob, 24 Oct).
 */
import { prisma } from "@repo/database";
import { CREATOR_POOL_ABI, getChainConfig, getRpcTransport } from "@repo/web3";
import { createPublicClient, isAddress, type Address } from "viem";
import { trustedEmailWhere } from "../../utils/verificationGrace";

export type FollowState = "active" | "pending" | "none";

/**
 * ACTIVE follow with the Fan Graph rule: the follower is not suspended and has a
 * verified email or is inside the 30 day grace. A follow from an account past the
 * grace without a verified email is pending.
 */
export async function followState(ownerUserId: number, viewerUserId: number): Promise<FollowState> {
  const row = await prisma.follow.findUnique({
    where: { follower_id_creator_id: { follower_id: viewerUserId, creator_id: ownerUserId } },
    select: { id: true },
  });
  if (!row) return "none";
  const counted = await prisma.user.count({
    where: { id: viewerUserId, block: "no", AND: [trustedEmailWhere()] },
  });
  return counted > 0 ? "active" : "pending";
}

export type PoolRef = {
  id: number;
  ownerUserId: number;
  chainId: string;
  poolAddress: string | null;
};

export async function loadPool(poolId: number): Promise<PoolRef | null> {
  const pool = await prisma.creatorPool.findUnique({
    where: { id: poolId },
    select: { id: true, chainId: true, poolAddress: true, wallet: { select: { userId: true } } },
  });
  if (!pool) return null;
  return {
    id: pool.id,
    ownerUserId: pool.wallet.userId,
    chainId: pool.chainId,
    poolAddress: pool.poolAddress,
  };
}

/** The viewer's stake in wei from the StakedPool mirror (updated when the fan confirms through Amped). */
export async function mirrorStakeWei(poolId: number, viewerUserId: number): Promise<bigint> {
  const row = await prisma.stakedPool.findFirst({
    where: { poolId, userWallet: { userId: viewerUserId } },
    select: { stakeAmount: true },
  });
  if (!row || !/^\d+$/.test(row.stakeAmount)) return 0n;
  return BigInt(row.stakeAmount);
}

/** Read only fanStakes(address) on the pool contract. Throws when the chain cannot be read. */
export async function chainStakeWei(pool: PoolRef, wallet: string): Promise<bigint> {
  const chain = getChainConfig(parseInt(pool.chainId, 10));
  if (!chain || !pool.poolAddress || !isAddress(pool.poolAddress) || !isAddress(wallet)) {
    throw new Error("pool or wallet cannot be read on chain");
  }
  const client = createPublicClient({ chain, transport: getRpcTransport(chain) });
  const value = await client.readContract({
    address: pool.poolAddress as Address,
    abi: CREATOR_POOL_ABI,
    functionName: "fanStakes",
    args: [wallet as Address],
  });
  return value as bigint;
}
