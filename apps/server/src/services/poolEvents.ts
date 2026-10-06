import { prisma } from "@repo/database";
import { createPublicClient, type AbiEvent, type Address, type Log, type PublicClient } from "viem";
import { CREATOR_POOL_ABI, getChainConfig, getRpcTransport } from "@repo/web3";

// Screen Review 067 to 069: pool events My Pool reads besides stake and
// unstake. The launch stake is recorded as eventType "create" and fan claims
// (RewardClaimed) as eventType "claim". RewardReceived is summed into
// creator_pools.rewards_received. Stake totals count "stake" and "create" and
// subtract "unstake"; "claim" never changes a stake total.

export const STAKE_IN_EVENTS = ["stake", "create"];

/** Net stake of a list of events: stake and create add, unstake subtracts, claims are ignored. */
export function netStake(events: { eventType: string; amount: string }[]): bigint {
  return events.reduce((sum, event) => {
    if (STAKE_IN_EVENTS.includes(event.eventType)) return sum + BigInt(event.amount);
    if (event.eventType === "unstake") return sum - BigInt(event.amount);
    return sum;
  }, 0n);
}

const BLOCK_RANGE = 5000n;
// One run scans at most this many chunks; the cursor keeps the progress
const MAX_CHUNKS_PER_RUN = 200;

const REWARD_RECEIVED = CREATOR_POOL_ABI.find(
  item => item.type === "event" && item.name === "RewardReceived"
) as AbiEvent;
const REWARD_CLAIMED = CREATOR_POOL_ABI.find(
  item => item.type === "event" && item.name === "RewardClaimed"
) as AbiEvent;

function clientFor(chainId: string): PublicClient | null {
  const chain = getChainConfig(Number(chainId));
  if (!chain) return null;
  return createPublicClient({ chain, transport: getRpcTransport(chain) }) as PublicClient;
}

/**
 * 069 I14: record the launch as the pool's first event. Reads the value of
 * the creation transaction and writes one "create" StakeEvent for the
 * creator's wallet. Safe to call again: the unique key skips duplicates.
 */
export async function recordCreateEvent(poolId: number): Promise<void> {
  const pool = await prisma.creatorPool.findUnique({ where: { id: poolId } });
  if (!pool?.creationTxid) return;
  const existing = await prisma.stakeEvent.findFirst({
    where: { poolId, eventType: "create" },
    select: { id: true },
  });
  if (existing) return;

  const client = clientFor(pool.chainId);
  if (!client) return;
  const hash = pool.creationTxid as `0x${string}`;
  const tx = await client.getTransaction({ hash });
  const block = tx.blockNumber ? await client.getBlock({ blockNumber: tx.blockNumber }) : null;

  await prisma.stakeEvent.createMany({
    data: [
      {
        userWalletId: pool.walletId,
        poolId,
        amount: tx.value.toString(),
        eventType: "create",
        transactionHash: hash,
        createdAt: block ? new Date(Number(block.timestamp) * 1000) : new Date(),
      },
    ],
    skipDuplicates: true,
  });
}

async function readLogs(
  client: PublicClient,
  address: Address,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint
) {
  const logs: Log[] = [];
  let chunks = 0;
  for (let start = fromBlock; start <= toBlock; start += BLOCK_RANGE) {
    if (chunks++ >= MAX_CHUNKS_PER_RUN) break;
    const end = start + BLOCK_RANGE - 1n > toBlock ? toBlock : start + BLOCK_RANGE - 1n;
    logs.push(...(await client.getLogs({ address, event, fromBlock: start, toBlock: end })));
  }
  return logs;
}

async function startBlock(client: PublicClient, creationTxid: string | null) {
  if (!creationTxid) return null;
  const receipt = await client.getTransactionReceipt({ hash: creationTxid as `0x${string}` });
  return receipt.blockNumber;
}

const inFlight = new Map<number, Promise<boolean>>();

/**
 * 067 and 069 I11: index RewardReceived and RewardClaimed for one pool from
 * the saved cursor to the latest block. Returns true when the index is
 * current. One run per pool at a time; callers may wait or not.
 */
export function indexPoolRewards(poolId: number): Promise<boolean> {
  const running = inFlight.get(poolId);
  if (running) return running;
  const run = runIndex(poolId).finally(() => inFlight.delete(poolId));
  inFlight.set(poolId, run);
  return run;
}

async function runIndex(poolId: number): Promise<boolean> {
  const pool = await prisma.creatorPool.findUnique({ where: { id: poolId } });
  if (!pool?.poolAddress) return false;
  const client = clientFor(pool.chainId);
  if (!client) return false;

  const latest = await client.getBlockNumber();
  const from = pool.rewardsIndexedBlock
    ? BigInt(pool.rewardsIndexedBlock) + 1n
    : await startBlock(client, pool.creationTxid);
  // Legacy pools without a creation transaction have no start block to scan from
  if (from === null) return false;
  if (from > latest) return true;

  const maxTo = from + BLOCK_RANGE * BigInt(MAX_CHUNKS_PER_RUN) - 1n;
  const to = maxTo < latest ? maxTo : latest;
  const address = pool.poolAddress as Address;
  const [received, claimed] = await Promise.all([
    readLogs(client, address, REWARD_RECEIVED, from, to),
    readLogs(client, address, REWARD_CLAIMED, from, to),
  ]);

  const receivedSum = received.reduce(
    (sum, log) => sum + ((log as unknown as { args: { amount: bigint } }).args.amount ?? 0n),
    0n
  );

  // Claims by wallets Amped.Bio knows (StakeEvent needs a wallet row)
  const claims = claimed.map(log => {
    const args = (log as unknown as { args: { fan: Address; amount: bigint } }).args;
    return {
      fan: args.fan.toLowerCase(),
      amount: args.amount,
      hash: log.transactionHash!,
      block: log.blockNumber!,
    };
  });
  const wallets = claims.length
    ? await prisma.userWallet.findMany({
        where: { address: { in: [...new Set(claims.map(claim => claim.fan))] } },
        select: { id: true, address: true },
      })
    : [];
  const walletByAddress = new Map(wallets.map(wallet => [wallet.address.toLowerCase(), wallet.id]));
  const known = claims.filter(claim => walletByAddress.has(claim.fan));
  const blockTimes = new Map<bigint, Date>();
  for (const blockNumber of new Set(known.map(claim => claim.block))) {
    const block = await client.getBlock({ blockNumber });
    blockTimes.set(blockNumber, new Date(Number(block.timestamp) * 1000));
  }

  // Optimistic lock on the cursor: if another server instance moved it, this
  // run writes nothing, so a reward is never counted twice
  const moved = await prisma.$transaction(async tx => {
    const updated = await tx.creatorPool.updateMany({
      where: { id: poolId, rewardsIndexedBlock: pool.rewardsIndexedBlock },
      data: {
        rewardsReceived: (BigInt(pool.rewardsReceived || "0") + receivedSum).toString(),
        rewardsIndexedBlock: to.toString(),
      },
    });
    if (updated.count === 0) return false;
    await tx.stakeEvent.createMany({
      data: known.map(claim => ({
        userWalletId: walletByAddress.get(claim.fan)!,
        poolId,
        amount: claim.amount.toString(),
        eventType: "claim",
        transactionHash: claim.hash,
        createdAt: blockTimes.get(claim.block) ?? new Date(),
      })),
      skipDuplicates: true,
    });
    return true;
  });
  if (!moved) return false;
  return to >= latest;
}

/** Waits for the index up to `ms`; returns whether it is current. */
export async function indexPoolRewardsWithin(poolId: number, ms: number): Promise<boolean> {
  const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), ms));
  return Promise.race([indexPoolRewards(poolId).catch(() => false), timeout]);
}
