import { Address, createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TRPCError } from "@trpc/server";
import { getChainConfig, SIMPLE_BATCH_SEND_ABI } from "@repo/web3";
import { AFFILIATES_CHAIN_ID } from "@repo/constants";
import { prisma } from "./DB";
import { cache } from "../utils/cache";
import { uuidv7 } from "../utils/uuid-v7";
import { env } from "../env";

/**
 * Process a daily airdrop claim for a user.
 * - If user has zero balance: sends instantly via FAUCET_PRIVATE_KEY
 * - If user has balance > 0: queues into the daily batch
 */
export async function processDailyAirdropClaim(
  userId: number,
  walletAddress: Address,
  chainId: number
): Promise<{
  status: "instant" | "queued";
  txid?: string;
  position?: number;
  totalInBatch?: number;
  estimatedTime?: string;
  amount: string;
  currency: string;
}> {
  const chain = getChainConfig(chainId);
  if (!chain) {
    throw new Error("Invalid chain ID");
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const amountInEther = Number(env.FAUCET_AMOUNT);
  const amountInWei = parseEther(amountInEther.toString());

  // Check user's current REVO balance on-chain
  const balance = await publicClient.getBalance({ address: walletAddress });

  if (balance === 0n) {
    // ── INSTANT SEND ──
    if (!env.FAUCET_PRIVATE_KEY) {
      throw new Error("Faucet not configured");
    }

    const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const isMockMode = env.FAUCET_MOCK_MODE === "true";

    let hash: `0x${string}`;
    if (isMockMode) {
      hash = `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      hash = await walletClient.sendTransaction({
        to: walletAddress,
        value: amountInWei,
        chain,
      });
    }

    return {
      status: "instant",
      txid: hash,
      amount: amountInEther.toString(),
      currency: chain.nativeCurrency.symbol,
    };
  }

  // ── QUEUE FOR BATCH ──
  const wallet = await prisma.userWallet.findFirst({ where: { userId } });
  if (!wallet) {
    throw new Error("Wallet not found");
  }

  await prisma.$transaction(async tx => {
    // Check for existing entry (unique constraint safety)
    const existing = await tx.airdropQueueEntry.findUnique({
      where: { userWalletId: wallet.id },
    });
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Already queued for today's batch",
      });
    }

    await tx.airdropQueueEntry.create({
      data: {
        // New entities use UUID v7 stored as BINARY(16)
        id: uuidv7(),
        userWalletId: wallet.id,
        amount: amountInWei.toString(),
      },
    });
  });

  // Calculate position and estimate
  const now = new Date();
  const position = await prisma.airdropQueueEntry.count({
    where: { createdAt: { lte: now } },
  });
  const totalInBatch = await prisma.airdropQueueEntry.count();
  const estimatedTime = calculateNextBatchTime();

  return {
    status: "queued",
    position,
    totalInBatch,
    estimatedTime,
    amount: amountInEther.toString(),
    currency: chain.nativeCurrency.symbol,
  };
}

// Claim marker persisted before the real hash exists: "pending:{nonce}". The
// batch is sent with that exact nonce, so a lost or timed out send can never be
// paid twice: the chain accepts one transaction per nonce. The hash replaces
// the marker as soon as the contract call returns.
const TX_PENDING = "pending";
// The random part keeps two workers that read the same nonce from sharing a marker
const pendingMarker = (nonce: number) =>
  `${TX_PENDING}:${nonce}:${Math.random().toString(36).slice(2, 10)}`;
const isPending = (txHash: string | null) => !!txHash && txHash.startsWith(TX_PENDING);
const pendingNonce = (txHash: string): number | null => {
  const value = Number(txHash.split(":")[1]);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

/** Claims without a hash older than this belong to a dead worker (cron: 15 min). */
const CLAIM_STALE_MS = 15 * 60 * 1000;

/**
 * Send all pending airdrop queue entries via SIMPLE_BATCH_SEND.send().
 * Crash safe by design: an atomic lock and row claim admit exactly one worker,
 * the tx hash is persisted the moment the call returns, and the receipt
 * decides whether the queue is cleared. Entries are never resent on a timer.
 */
export async function sendPendingBatch(): Promise<void> {
  const lockKey = "daily_airdrop:batch_lock";
  const locked = await cache.setIfAbsent(lockKey, "1", 600);
  if (!locked) {
    console.log(`[BATCH_SKIP_LOCKED] Another cron already processing`);
    return;
  }

  try {
    const chain = getChainConfig(AFFILIATES_CHAIN_ID);
    if (!chain) {
      console.error(`[BATCH_FAILED] Invalid chain config for AFFILIATES_CHAIN_ID=${AFFILIATES_CHAIN_ID}`);
      return;
    }

    const contractAddress = chain.contracts?.SIMPLE_BATCH_SEND?.address;
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      console.error(`[BATCH_FAILED] SIMPLE_BATCH_SEND not configured for chain ${AFFILIATES_CHAIN_ID}`);
      return;
    }

    if (!env.FAUCET_PRIVATE_KEY) {
      console.error(`[BATCH_FAILED] FAUCET_PRIVATE_KEY not configured`);
      return;
    }

    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    let entries = await prisma.airdropQueueEntry.findMany({
      orderBy: { createdAt: "asc" },
      include: { userWallet: { select: { address: true } } },
    });
    if (entries.length === 0) return;

    // Settle an interrupted batch first: a persisted hash means the send
    // already left this server, so the receipt decides the queue, never a resend
    const settleInFlight = async (settling: Array<{ id: Uint8Array; txHash: `0x${string}` }>) => {
      const ids = settling.map(entry => entry.id);
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: settling[0].txHash });
        if (receipt.status === "success") {
          await prisma.airdropQueueEntry.deleteMany({ where: { id: { in: ids } } });
          console.log(`[BATCH_SETTLED] txid=${settling[0].txHash}, deleted=${ids.length}`);
        } else {
          console.error(
            `[BATCH_SETTLED_REVERTED] txid=${settling[0].txHash}, releasing ${ids.length} entries`
          );
          await releaseClaim(ids);
        }
      } catch (error) {
        console.error(
          `[BATCH_SETTLE_FAILED] txid=${settling[0].txHash}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        // Keep the persisted hash: the next run settles again
      }
    };

    // Group by hash: one interrupted send per hash, and only its own rows are
    // settled by that receipt
    const byHash = new Map<`0x${string}`, Array<{ id: Uint8Array; txHash: `0x${string}` }>>();
    for (const entry of entries) {
      if (!entry.txHash || isPending(entry.txHash)) continue;
      const hash = entry.txHash as `0x${string}`;
      const group = byHash.get(hash) ?? [];
      group.push({ id: entry.id, txHash: hash });
      byHash.set(hash, group);
    }
    if (byHash.size > 0) {
      for (const settling of byHash.values()) {
        await settleInFlight(settling);
      }
      entries = await prisma.airdropQueueEntry.findMany({
        orderBy: { createdAt: "asc" },
        include: { userWallet: { select: { address: true } } },
      });
      if (entries.length === 0) return;
    }

    // Claims without a hash belong to a worker that died or whose send call
    // failed. The send may still have reached the chain, so the claim's nonce
    // decides: used on chain means paid (delete), still in the mempool means
    // wait, never used means release for this run. Never resend blind.
    const faucetAddress = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`).address;
    const stale = entries.filter(
      entry =>
        isPending(entry.txHash) &&
        entry.claimedAt !== null &&
        Date.now() - entry.claimedAt.getTime() > CLAIM_STALE_MS
    );
    if (stale.length > 0) {
      const [minedCount, pendingCount] = await Promise.all([
        publicClient.getTransactionCount({ address: faucetAddress, blockTag: "latest" }),
        publicClient.getTransactionCount({ address: faucetAddress, blockTag: "pending" }),
      ]);
      const byNonce = new Map<number | null, Uint8Array[]>();
      for (const entry of stale) {
        const nonce = pendingNonce(entry.txHash!);
        byNonce.set(nonce, [...(byNonce.get(nonce) ?? []), entry.id]);
      }
      for (const [nonce, ids] of byNonce) {
        if (nonce === null) {
          // An old marker with no nonce: the outcome is unknown, so a person checks
          console.error(`[BATCH_STALE_UNKNOWN] ${ids.length} entries need a manual check`);
        } else if (nonce < minedCount) {
          console.error(`[BATCH_STALE_MINED] nonce=${nonce}: treated as paid, deleting ${ids.length}`);
          await prisma.airdropQueueEntry.deleteMany({ where: { id: { in: ids } } });
        } else if (nonce < pendingCount) {
          console.log(`[BATCH_STALE_IN_MEMPOOL] nonce=${nonce}: waiting for it to mine`);
        } else {
          await releaseClaim(ids);
        }
      }
      entries = await prisma.airdropQueueEntry.findMany({
        orderBy: { createdAt: "asc" },
        include: { userWallet: { select: { address: true } } },
      });
      if (entries.length === 0) return;
    }

    // Atomic row claim: the conditional update admits exactly one worker
    const unclaimed = entries.filter(entry => entry.txHash === null);
    if (unclaimed.length === 0) {
      console.log("[BATCH_SKIP_CLAIMED] Entries are claimed by another worker");
      return;
    }
    // The batch goes out with this nonce and no other (see TX_PENDING)
    const nonce = await publicClient.getTransactionCount({
      address: faucetAddress,
      blockTag: "pending",
    });
    const marker = pendingMarker(nonce);
    const claimed = await prisma.airdropQueueEntry.updateMany({
      where: { id: { in: unclaimed.map(entry => entry.id) }, txHash: null },
      data: { txHash: marker, claimedAt: new Date() },
    });
    if (claimed.count === 0) {
      console.log("[BATCH_SKIP_CLAIMED] Another worker claimed the entries");
      return;
    }
    // Pay only the rows this run claimed: another worker may hold some of them
    const claimable = await prisma.airdropQueueEntry.findMany({
      where: { txHash: marker },
      orderBy: { createdAt: "asc" },
      include: { userWallet: { select: { address: true } } },
    });
    const claimIds = claimable.map(entry => entry.id);

    const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const recipients: Address[] = claimable.map(entry => entry.userWallet.address as Address);
    const amounts: bigint[] = claimable.map(entry => BigInt(entry.amount));
    const totalValue = amounts.reduce((sum, amount) => sum + amount, 0n);

    const balanceBefore = await publicClient.getBalance({ address: account.address });
    if (balanceBefore < totalValue) {
      console.error(
        `[BATCH_INSUFFICIENT_FUNDS] balance=${balanceBefore.toString()}, required=${totalValue.toString()}`
      );
      await releaseClaim(claimIds);
      return;
    }

    const isMockMode = env.FAUCET_MOCK_MODE === "true";

    let hash: `0x${string}`;
    if (isMockMode) {
      hash = `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;
      console.log(
        `[BATCH_MOCK] Simulated batch send for ${claimable.length} recipients, total=${totalValue.toString()}`
      );
      // Mock sends never mine, so there is no receipt to wait for
      await prisma.airdropQueueEntry.deleteMany({ where: { id: { in: claimIds } } });
      return;
    }

    console.log(
      `[BATCH_SENDING] recipients=${recipients.length}, total=${totalValue.toString()}, contract=${contractAddress}`
    );

    try {
      hash = await walletClient.writeContract({
        address: contractAddress,
        abi: SIMPLE_BATCH_SEND_ABI,
        functionName: "send",
        args: [recipients, amounts],
        value: totalValue,
        chain,
        nonce,
      });
    } catch (error) {
      // Nonce already used (an instant faucet send took it): nothing of this
      // batch reached the chain, so the rows go back to the queue now
      if (error instanceof Error && /nonce/i.test(error.message)) {
        console.error(`[BATCH_NONCE_TAKEN] nonce=${nonce}, releasing ${claimIds.length} entries`);
        await releaseClaim(claimIds);
        return;
      }
      // Any other failure may have broadcast: the stale check settles it by nonce
      throw error;
    }

    // Persist the tx hash before waiting for the receipt: a crash during the
    // wait settles from the stored hash on the next run instead of resending
    await prisma.airdropQueueEntry.updateMany({
      where: { id: { in: claimIds } },
      data: { txHash: hash },
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      console.error(`[BATCH_REVERTED] txid=${hash}, count=${claimable.length}`);
      await releaseClaim(claimIds);
      return;
    }

    await prisma.airdropQueueEntry.deleteMany({ where: { id: { in: claimIds } } });
    console.log(
      `[BATCH_SENT] txid=${hash}, count=${claimable.length}, total=${totalValue.toString()}`
    );
  } catch (error) {
    console.error(`[BATCH_FAILED] ${error instanceof Error ? error.message : "Unknown error"}`);
    // Entries keep their state: the next run settles or retries from it
  } finally {
    await cache.delete(lockKey);
  }
}

/** Release claimed rows back to the queue without deleting them. */
async function releaseClaim(ids: Uint8Array[]): Promise<void> {
  await prisma.airdropQueueEntry.updateMany({
    where: { id: { in: ids } },
    data: { txHash: null, claimedAt: null },
  });
}

/**
 * Calculate the next batch send time based on configured UTC hour.
 * Returns ISO string of the estimated time.
 */
export function calculateNextBatchTime(): string {
  const now = new Date();
  const batchHour = env.DAILY_AIRDROP_BATCH_HOUR ?? 14;
  const batchTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), batchHour, 0, 0));

  // If today's batch time has passed, use tomorrow
  if (now.getTime() >= batchTime.getTime()) {
    batchTime.setUTCDate(batchTime.getUTCDate() + 1);
  }

  return batchTime.toISOString();
}