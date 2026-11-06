import {
  Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseEther,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TRPCError } from "@trpc/server";
import { getChainConfig, SIMPLE_BATCH_SEND_ABI } from "@repo/web3";
import { AFFILIATES_CHAIN_ID, SITE_SETTINGS } from "@repo/constants";
import { prisma } from "./DB";
import { cache } from "../utils/cache";
import { uuidv7 } from "../utils/uuid-v7";
import { env } from "../env";

/**
 * An instant faucet send whose outcome is unknown: the node may have accepted
 * the transaction before the connection failed. The router keeps the cooldown
 * for this error, otherwise a retry could pay the fan twice.
 */
export class AirdropSendUnknownError extends Error {
  constructor(cause: unknown) {
    super("The faucet transaction may still reach the chain");
    this.name = "AirdropSendUnknownError";
    this.cause = cause;
  }
}

/**
 * Errors raised by the node or before the send that prove the transaction
 * never left this server: configuration, balance, nonce and fee rejections.
 * Timeouts and network errors are deliberately not included because they may
 * have reached the chain.
 */
export function isPreBroadcastSendError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = `${error.name} ${error.message}`.toLowerCase();
  if (text.includes("insufficient funds") || text.includes("insufficientfunds")) return true;
  if (text.includes("nonce")) return true;
  if (
    text.includes("underpriced") ||
    text.includes("fee cap") ||
    text.includes("max fee") ||
    text.includes("replacement transaction")
  ) {
    return true;
  }
  return false;
}

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
      try {
        hash = await walletClient.sendTransaction({
          to: walletAddress,
          value: amountInWei,
          chain,
        });
      } catch (error) {
        // A node rejection proves nothing was broadcast. A timeout or network
        // error does not, so the router must keep the cooldown in that case.
        if (isPreBroadcastSendError(error)) throw error;
        throw new AirdropSendUnknownError(error);
      }
    }

    return {
      status: "instant",
      txid: hash,
      amount: amountInEther.toString(),
      currency: chain.nativeCurrency.symbol,
    };
  }

  // ── QUEUE FOR BATCH ──
  // Queue rows carry no chain: the batch always pays on AFFILIATES_CHAIN_ID,
  // so a claim on another chain would be queued and later paid somewhere else.
  if (chainId !== AFFILIATES_CHAIN_ID) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The daily batch pays on chain ${AFFILIATES_CHAIN_ID}. Switch networks to join the queue.`,
    });
  }

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

// A claim is marked "pending:{nonce}:{random}" before anything is signed. The
// batch is built with that exact nonce, signed locally, and only then marked
// "sent:{nonce}:{hash}" and broadcast. Persisting the hash before the broadcast
// is what makes settlement safe: the batch is identified by its own signed
// transaction, never by a nonce that an instant faucet send may also use.
const TX_PENDING = "pending";
const TX_SENT = "sent";
// The random part keeps two workers that read the same nonce from sharing a marker
const pendingMarker = (nonce: number) =>
  `${TX_PENDING}:${nonce}:${Math.random().toString(36).slice(2, 10)}`;
const sentMarker = (nonce: number, hash: `0x${string}`) => `${TX_SENT}:${nonce}:${hash}`;
const isPending = (txHash: string | null) => !!txHash && txHash.startsWith(`${TX_PENDING}:`);
const markerNonce = (txHash: string): number | null => {
  const value = Number(txHash.split(":")[1]);
  return Number.isInteger(value) && value >= 0 ? value : null;
};
const markerHash = (txHash: string | null): `0x${string}` | null => {
  if (!txHash) return null;
  const parts = txHash.split(":");
  // A bare hash is a row persisted by the previous format; it still settles.
  const hash = parts[0] === TX_SENT ? parts[2] : txHash;
  return hash?.startsWith("0x") ? (hash as `0x${string}`) : null;
};

/** A pending or dropped claim older than this belongs to a dead worker (cron: 15 min). */
const CLAIM_STALE_MS = 15 * 60 * 1000;

/** A node rejection of the signed transaction's nonce means it can never mine. */
function isNonceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /nonce/i.test(`${error.name} ${error.message}`);
}

/**
 * Send all pending airdrop queue entries via SIMPLE_BATCH_SEND.send().
 * Crash safe by design: an atomic lock and row claim admit exactly one worker,
 * the signed transaction's hash is persisted before it is broadcast, and the
 * receipt decides whether the queue is cleared. Entries are never resent blind.
 */
export async function sendPendingBatch(): Promise<void> {
  // Kill switch: the admin can pause the faucet between cron ticks.
  const faucetStatus = await prisma.siteSettings.findUnique({
    where: { setting_key: SITE_SETTINGS.FAUCET_ENABLED },
  });
  if (faucetStatus?.setting_value !== "true") {
    console.log("[BATCH_SKIP_DISABLED] Faucet is disabled");
    return;
  }

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

    const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
    const faucetAddress = account.address;

    let entries = await prisma.airdropQueueEntry.findMany({
      orderBy: { createdAt: "asc" },
      include: { userWallet: { select: { address: true } } },
    });
    if (entries.length === 0) return;

    // Settle an interrupted batch first: a persisted hash identifies the exact
    // signed transaction, so its receipt decides the queue, never a resend.
    const settleInFlight = async (
      hash: `0x${string}`,
      nonce: number | null,
      claimedAt: Date | null,
      ids: Uint8Array[]
    ) => {
      const isStale = claimedAt !== null && Date.now() - claimedAt.getTime() > CLAIM_STALE_MS;

      let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>> | null = null;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash });
      } catch (error) {
        if (!(error instanceof TransactionReceiptNotFoundError)) {
          console.error(
            `[BATCH_SETTLE_FAILED] txid=${hash}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          return;
        }
      }

      if (receipt) {
        if (receipt.status === "success") {
          await prisma.airdropQueueEntry.deleteMany({ where: { id: { in: ids } } });
          console.log(`[BATCH_SETTLED] txid=${hash}, deleted=${ids.length}`);
        } else {
          console.error(`[BATCH_SETTLED_REVERTED] txid=${hash}, releasing ${ids.length} entries`);
          await releaseClaim(ids);
        }
        return;
      }

      // No receipt yet: the transaction may still be waiting in the mempool.
      let inMempool = false;
      try {
        inMempool = !!(await publicClient.getTransaction({ hash }));
      } catch (error) {
        if (!(error instanceof TransactionNotFoundError)) {
          console.error(
            `[BATCH_SETTLE_FAILED] txid=${hash}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          return;
        }
      }
      if (inMempool) {
        console.log(`[BATCH_SETTLE_IN_MEMPOOL] txid=${hash}: waiting for it to mine`);
        return;
      }

      // The node does not know this signed transaction. If another transaction
      // already used its nonce (for example an instant faucet send) this batch
      // can never mine, so the rows are released, not marked paid. If the nonce
      // is still free the signed tx was dropped: after CLAIM_STALE_MS the rows
      // are released too, because rebuilding the batch reuses the same nonce
      // and replaces the dropped transaction, so it still cannot pay twice.
      const minedCount = await publicClient.getTransactionCount({
        address: faucetAddress,
        blockTag: "latest",
      });
      if (nonce !== null && minedCount > nonce) {
        console.error(
          `[BATCH_SETTLED_REPLACED] txid=${hash}, nonce=${nonce}: releasing ${ids.length} entries`
        );
        await releaseClaim(ids);
        return;
      }
      if (!isStale) return;
      console.log(`[BATCH_SETTLED_DROPPED] txid=${hash}: releasing ${ids.length} entries`);
      await releaseClaim(ids);
    };

    // Group by hash: one interrupted send per hash, and only its own rows are
    // settled by that transaction
    const byHash = new Map<
      `0x${string}`,
      { nonce: number | null; claimedAt: Date | null; ids: Uint8Array[] }
    >();
    for (const entry of entries) {
      const hash = markerHash(entry.txHash);
      if (!hash) continue;
      const group = byHash.get(hash) ?? {
        nonce: markerNonce(entry.txHash!),
        claimedAt: entry.claimedAt,
        ids: [],
      };
      group.ids.push(entry.id);
      byHash.set(hash, group);
    }
    if (byHash.size > 0) {
      for (const [hash, group] of byHash) {
        await settleInFlight(hash, group.nonce, group.claimedAt, group.ids);
      }
      entries = await prisma.airdropQueueEntry.findMany({
        orderBy: { createdAt: "asc" },
        include: { userWallet: { select: { address: true } } },
      });
      if (entries.length === 0) return;
    }

    // A pending marker has no signed transaction behind it: the worker died
    // before signing. Nothing was broadcast, so the stale rows can safely go
    // back to the queue without any risk of a double payment.
    const stalePending = entries.filter(
      entry =>
        isPending(entry.txHash) &&
        entry.claimedAt !== null &&
        Date.now() - entry.claimedAt.getTime() > CLAIM_STALE_MS
    );
    if (stalePending.length > 0) {
      console.log(`[BATCH_STALE_PENDING] releasing ${stalePending.length} entries`);
      await releaseClaim(stalePending.map(entry => entry.id));
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
    // The batch is built with this nonce and no other (see TX_PENDING)
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

    if (isMockMode) {
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

    // Build and sign locally so the hash is known before the node sees the
    // transaction. A failure here never reached the node, so release at once.
    let serializedTransaction: `0x${string}`;
    let hash: `0x${string}`;
    try {
      const request = await walletClient.prepareTransactionRequest({
        to: contractAddress as Address,
        data: encodeFunctionData({
          abi: SIMPLE_BATCH_SEND_ABI,
          functionName: "send",
          args: [recipients, amounts],
        }),
        value: totalValue,
        nonce,
      });
      // viem types the client against the union of supported chains; the
      // request was prepared by this same client, so the cast is shape only.
      serializedTransaction = await walletClient.signTransaction(
        request as Parameters<typeof walletClient.signTransaction>[0]
      );
      hash = keccak256(serializedTransaction);
    } catch (error) {
      console.error(
        `[BATCH_SIGN_FAILED] ${error instanceof Error ? error.message : "Unknown error"}`
      );
      await releaseClaim(claimIds);
      return;
    }

    // Persist the signed hash before broadcasting: settlement identifies this
    // exact batch by hash, never by a nonce that an instant send may reuse.
    const persisted = await prisma.airdropQueueEntry.updateMany({
      where: { id: { in: claimIds }, txHash: marker },
      data: { txHash: sentMarker(nonce, hash) },
    });
    if (persisted.count === 0) {
      console.log("[BATCH_SKIP_CLAIMED] Entries changed before broadcast");
      return;
    }

    try {
      await publicClient.sendRawTransaction({ serializedTransaction });
    } catch (error) {
      // The node rejected this exact signed transaction for its nonce, so it
      // can never mine: return the rows to the queue for a later nonce.
      if (isNonceError(error)) {
        console.error(`[BATCH_NONCE_TAKEN] nonce=${nonce}, releasing ${claimIds.length} entries`);
        await releaseClaim(claimIds);
        return;
      }
      // A timeout or network error may still have broadcast: the persisted
      // hash lets the next run settle by receipt instead of resending.
      throw error;
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
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