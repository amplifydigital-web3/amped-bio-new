import { prisma } from "../DB";

/**
 * Fan Graph (#22). Batch check: which of `creatorIds` has the viewer as a pool
 * fan (stake above zero in any of that creator's pools). Shared by
 * user.getUsers (Explore person cards). follow.ts keeps its own copy for
 * listFollowing until the two are consolidated.
 */
export async function batchPoolFanCreatorIds(
  creatorIds: number[],
  viewerId: number
): Promise<Set<number>> {
  if (creatorIds.length === 0) return new Set();
  const wallets = await prisma.userWallet.findMany({
    where: { userId: { in: creatorIds } },
    select: { userId: true, creatorPools: { select: { id: true } } },
  });
  const poolToCreator = new Map<number, number>();
  const allPoolIds: number[] = [];
  for (const wallet of wallets) {
    for (const pool of wallet.creatorPools) {
      allPoolIds.push(pool.id);
      poolToCreator.set(pool.id, wallet.userId);
    }
  }
  if (allPoolIds.length === 0) return new Set();
  const stakes = await prisma.stakedPool.findMany({
    where: {
      poolId: { in: allPoolIds },
      NOT: { stakeAmount: "0" },
      userWallet: { userId: viewerId },
    },
    select: { poolId: true },
  });
  const fanCreators = new Set<number>();
  for (const stake of stakes) {
    const creatorId = poolToCreator.get(stake.poolId);
    if (creatorId !== undefined) fanCreators.add(creatorId);
  }
  return fanCreators;
}
