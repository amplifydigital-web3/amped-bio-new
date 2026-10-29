/**
 * One time backfill of the pool list stats (Build Board D7, PL1).
 * Spec: docs/features/pools-list-paging.md section 3.2.
 *
 * For every pool: createdAt from the launch event (else the earliest event),
 * a null name from the chain, the creator's stake from the chain, then the
 * stats columns. A dry run reports the changes and writes nothing. Running it
 * again gives the same result.
 */
import { prisma, Prisma } from "@repo/database";
import { createPublicClient, type Address } from "viem";
import { CREATOR_POOL_ABI, getChainConfig, getPoolName, getRpcTransport } from "@repo/web3";
import { bumpPoolsListVersion, computePoolStats, recomputePoolStats, toWei } from "./poolStats";

export interface BackfillOptions {
  apply: boolean;
  chainId?: string;
  /** Pools per multicall batch. */
  batchSize?: number;
  log?: (line: string) => void;
  /** Injected in tests; reads creatorStaked for each address, null on failure. */
  readCreatorStakes?: (chainId: string, addresses: Address[]) => Promise<(bigint | null)[]>;
  readPoolName?: (chainId: string, address: Address) => Promise<string | null>;
}

export interface BackfillRow {
  id: number;
  chainId: string;
  oldTotal: string;
  newTotal: string;
  oldFans: number;
  newFans: number;
  nameFilled: boolean;
}

async function chainCreatorStakes(chainId: string, addresses: Address[]) {
  const chain = getChainConfig(Number(chainId));
  if (!chain) return addresses.map(() => null);
  const client = createPublicClient({ chain, transport: getRpcTransport(chain) });
  const results = await client.multicall({
    contracts: addresses.map(address => ({
      address,
      abi: CREATOR_POOL_ABI,
      functionName: "creatorStaked" as const,
    })),
  });
  return results.map(r => (r.status === "success" ? (r.result as bigint) : null));
}

async function chainPoolName(chainId: string, address: Address) {
  try {
    return (await getPoolName(address, Number(chainId))) ?? null;
  } catch {
    return null;
  }
}

export async function backfillPoolStats(options: BackfillOptions): Promise<BackfillRow[]> {
  const log = options.log ?? (line => console.log(line));
  const batchSize = options.batchSize ?? 50;
  const readStakes = options.readCreatorStakes ?? chainCreatorStakes;
  const readName = options.readPoolName ?? chainPoolName;

  const pools = await prisma.creatorPool.findMany({
    where: options.chainId ? { chainId: options.chainId } : {},
    select: {
      id: true,
      chainId: true,
      walletId: true,
      name: true,
      poolAddress: true,
      revoStaked: true,
      fans: true,
    },
    orderBy: { id: "asc" },
  });
  log(`${pools.length} pools${options.apply ? "" : " (dry run, nothing is written)"}`);

  const rows: BackfillRow[] = [];
  const chains = new Set<string>();

  for (let i = 0; i < pools.length; i += batchSize) {
    const batch = pools.slice(i, i + batchSize);
    const byChain = new Map<string, typeof batch>();
    for (const pool of batch) {
      if (!pool.poolAddress) continue;
      byChain.set(pool.chainId, [...(byChain.get(pool.chainId) ?? []), pool]);
    }
    const stakes = new Map<number, bigint | null>();
    for (const [chainId, group] of byChain) {
      let values: (bigint | null)[];
      try {
        values = await readStakes(
          chainId,
          group.map(p => p.poolAddress as Address)
        );
      } catch (error) {
        log(
          `chain ${chainId}: creatorStaked read failed, using the launch stake (${String(error)})`
        );
        values = group.map(() => null);
      }
      group.forEach((pool, index) => stakes.set(pool.id, values[index] ?? null));
    }

    for (const pool of batch) {
      const events = await prisma.stakeEvent.findMany({
        where: { poolId: pool.id },
        select: { eventType: true, amount: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const launch = events.find(e => e.eventType === "create");
      const createdAt = launch?.createdAt ?? events[0]?.createdAt ?? null;

      let name = pool.name;
      let nameFilled = false;
      if (!name && pool.poolAddress) {
        name = await readName(pool.chainId, pool.poolAddress as Address);
        nameFilled = Boolean(name);
      }

      const stakeRows = await prisma.stakedPool.findMany({
        where: { poolId: pool.id },
        select: { userWalletId: true, stakeAmount: true },
      });
      const creatorStaked = stakes.get(pool.id) ?? null;
      const stats = computePoolStats(stakeRows, pool.walletId, {
        chain: creatorStaked,
        launchStake: toWei(launch?.amount),
      });

      const row: BackfillRow = {
        id: pool.id,
        chainId: pool.chainId,
        oldTotal: toWei(pool.revoStaked).toString(),
        newTotal: stats.totalStakeWei.toString(),
        oldFans: pool.fans,
        newFans: stats.activeFans,
        nameFilled,
      };
      rows.push(row);
      if (row.oldTotal !== row.newTotal || row.oldFans !== row.newFans || nameFilled) {
        log(
          `pool ${pool.id}: total ${row.oldTotal} -> ${row.newTotal}, fans ${row.oldFans} -> ${row.newFans}${nameFilled ? `, name "${name}"` : ""}`
        );
      }

      if (options.apply) {
        await prisma.$transaction(async tx => {
          const data: Prisma.CreatorPoolUpdateInput = {};
          if (createdAt) data.createdAt = createdAt;
          if (nameFilled && name) data.name = name;
          if (Object.keys(data).length) {
            await tx.creatorPool.update({ where: { id: pool.id }, data });
          }
          // Same writer as the live paths. The creator stake is the chain value
          // when it was read, else the launch stake plus the creator's own row.
          await recomputePoolStats(tx, pool.id, { creatorStaked: stats.creatorStakeWei });
        });
        chains.add(pool.chainId);
      }
    }
  }

  for (const chainId of chains) await bumpPoolsListVersion(chainId);
  const changed = rows.filter(r => r.oldTotal !== r.newTotal || r.oldFans !== r.newFans).length;
  log(
    `${rows.length} pools checked, ${changed} with a different total or fan count${options.apply ? ", written" : ""}.`
  );
  return rows;
}
