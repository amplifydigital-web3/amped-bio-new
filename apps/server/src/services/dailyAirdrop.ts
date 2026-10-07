import { Address, createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, SIMPLE_BATCH_SEND_ABI } from "@repo/web3";
import { AFFILIATES_CHAIN_ID } from "@repo/constants";
import { prisma } from "./DB";
import { cache } from "../utils/cache";
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

    let hash: string;
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
      throw new Error("Already queued for today's batch");
    }

    await tx.airdropQueueEntry.create({
      data: {
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

/**
 * Send all pending airdrop queue entries via SIMPLE_BATCH_SEND.send().
 * Uses Redis lock + balance check for crash-safe double-send protection.
 */
export async function sendPendingBatch(): Promise<void> {
  // Distributed lock via cache (prevents concurrent cron execution)
  const lockKey = "daily_airdrop:batch_lock";
  const hasLock = await cache.has(lockKey);
  if (hasLock) {
    console.log(`[BATCH_SKIP_LOCKED] Another cron already processing`);
    return;
  }
  await cache.set(lockKey, "1", 120);

  try {
    // Read all queue entries with FOR UPDATE lock
    const entries = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<
        Array<{ id: number; user_wallet_id: number; amount: string; address: string }>
      >(
        `SELECT q.id, q.user_wallet_id, q.amount, w.address
         FROM airdrop_queue q
         JOIN user_wallets w ON w.id = q.user_wallet_id
         ORDER BY q.created_at ASC
         FOR UPDATE`
      );
      return rows;
    });

    if (entries.length === 0) return;

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

    const account = privateKeyToAccount(env.FAUCET_PRIVATE_KEY as `0x${string}`);
    const publicClient = createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(chain.rpcUrls.default.http[0]),
    }) as any;

    // Balance BEFORE send (for crash-safety verification)
    const balanceBefore = await publicClient.getBalance({ address: account.address });
    const recipients: Address[] = entries.map(e => e.address as Address);
    const amounts: bigint[] = entries.map(e => BigInt(e.amount));
    const totalValue = amounts.reduce((sum, a) => sum + a, 0n);

    if (balanceBefore < totalValue) {
      console.error(
        `[BATCH_INSUFFICIENT_FUNDS] balance=${balanceBefore.toString()}, required=${totalValue.toString()}`
      );
      return;
    }

    const isMockMode = env.FAUCET_MOCK_MODE === "true";

    let hash: string;
    if (isMockMode) {
      hash = `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;
      console.log(`[BATCH_MOCK] Simulated batch send for ${entries.length} recipients, total=${totalValue.toString()}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log(
        `[BATCH_SENDING] recipients=${recipients.length}, total=${totalValue.toString()}, contract=${contractAddress}`
      );

      hash = await walletClient.writeContract({
        address: contractAddress,
        abi: SIMPLE_BATCH_SEND_ABI,
        functionName: "send",
        args: [recipients, amounts],
        value: totalValue,
      });

      // Crash-safety: verify balance decreased by exactly totalValue
      const balanceAfter = await publicClient.getBalance({ address: account.address });
      const expectedBalance = balanceBefore - totalValue;

      if (balanceAfter !== expectedBalance) {
        console.error(
          `[BATCH_BALANCE_MISMATCH] expected=${expectedBalance.toString()}, actual=${balanceAfter.toString()}, txid=${hash}`
        );
        console.error(`[BATCH_BALANCE_MISMATCH] NOT deleting queue entries to prevent double-send. Manual intervention required.`);
        throw new Error("Balance mismatch after batch send — possible double-send prevented");
      }
    }

    // Clear the queue
    await prisma.airdropQueueEntry.deleteMany();

    console.log(
      `[BATCH_SENT] txid=${hash}, count=${entries.length}, total=${totalValue.toString()}`
    );
  } catch (error) {
    console.error(`[BATCH_FAILED] ${error instanceof Error ? error.message : "Unknown error"}`);
    // Don't delete entries — cron will retry
  } finally {
    await cache.delete(lockKey);
  }
}

/**
 * Calculate the next batch send time based on configured UTC hour.
 * Returns ISO string of the estimated time.
 */
export function calculateNextBatchTime(): string {
  const now = new Date();
  const batchHour = env.DAILY_AIRDROP_BATCH_HOUR || 14;
  const batchTime = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), batchHour, 0, 0));

  // If today's batch time has passed, use tomorrow
  if (now.getTime() >= batchTime.getTime()) {
    batchTime.setUTCDate(batchTime.getUTCDate() + 1);
  }

  return batchTime.toISOString();
}