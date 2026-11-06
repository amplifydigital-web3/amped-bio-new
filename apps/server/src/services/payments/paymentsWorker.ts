import { getAbiItem, type Address, type Log } from "viem";
import { prisma } from "@repo/database";
import { AMPEDPAY_ABI, purchaseIdFromPaymentRef } from "@repo/web3";
import { env } from "../../env";
import { paymentChain, paymentClient } from "../usdc/chain";
import { ampedPayAddress } from "./onchain";
import { paymentSettings } from "./settings";
import { markRefunded } from "../store/sales";
import { settlePendingJoinsOnce } from "../memberships/core";
import { applyDuePayoutWallets } from "../merchants/payoutWallets";
import {
  PREPARED_TTL_MS,
  decodePaymentLogs,
  hexToPurchaseId,
  recordPaymentLogs,
  sendPurchaseReceipt,
  settlePurchase,
} from "./purchases";

/**
 * The PAY-2 worker (docs/features/ampedpay.md P0 4; content spec 3.9 step 4).
 *
 * Every 10 seconds it moves in flight purchases forward from their receipts (soft, final,
 * reorg, dropped), retries receipt emails and expires prepared purchases nobody signed.
 * Every third tick it reads AmpedPay's Paid, Share and Refunded logs at final depth: it
 * stores them as PaymentEvent rows, finishes a purchase whose submit response was lost, and
 * marks refunded purchases so access closes.
 */

export const PAYMENTS_WORKER_TICK_MS = 10_000;
const LOG_PASS_EVERY = 3;
export const INITIAL_LOOKBACK = 5_000n;
export const MAX_RANGE = 2_000n;
/** A submitting row with no transaction hash this long after its split expired never left. */
const SUBMITTING_GRACE_MS = 5 * 60 * 1000;
const BATCH = 50;

const EVENTS = [
  getAbiItem({ abi: AMPEDPAY_ABI, name: "Paid" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "Share" }),
  getAbiItem({ abi: AMPEDPAY_ABI, name: "Refunded" }),
];

export function paymentsCursorKey(chainId: number) {
  return `ampedpay_payments_cursor_${chainId}`;
}

/** The next block range to read, at `confirmations` depth. Exported for tests. */
export function nextPaymentsRange(
  cursor: bigint | null,
  head: bigint,
  confirmations: bigint
): { from: bigint; to: bigint } | null {
  const safe = head - confirmations + 1n;
  if (safe < 0n) return null;
  const from =
    cursor === null ? (safe > INITIAL_LOOKBACK ? safe - INITIAL_LOOKBACK : 0n) : cursor + 1n;
  if (from > safe) return null;
  const to = from + MAX_RANGE - 1n < safe ? from + MAX_RANGE - 1n : safe;
  return { from, to };
}

async function readCursor(): Promise<bigint | null> {
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: paymentsCursorKey(paymentChain.id) },
  });
  return row && /^\d+$/.test(row.setting_value) ? BigInt(row.setting_value) : null;
}

async function writeCursor(block: bigint) {
  await prisma.siteSettings.upsert({
    where: { setting_key: paymentsCursorKey(paymentChain.id) },
    create: {
      setting_key: paymentsCursorKey(paymentChain.id),
      setting_value: block.toString(),
      value_type: "NUMBER",
    },
    update: { setting_value: block.toString() },
  });
}

/** One pass over AmpedPay payment logs at final depth. Returns the events stored. */
export async function indexPaymentLogsOnce(now = new Date()): Promise<number> {
  const contract = ampedPayAddress();
  if (!contract) return 0;
  const client = paymentClient();
  const settings = await paymentSettings(now.getTime());
  const range = nextPaymentsRange(
    await readCursor(),
    await client.getBlockNumber(),
    BigInt(settings.finalConfirmations)
  );
  if (!range) return 0;

  const logs = (await client.getLogs({
    address: contract,
    events: EVENTS,
    fromBlock: range.from,
    toBlock: range.to,
  })) as Log[];
  const events = decodePaymentLogs(logs, contract as Address);

  const blockTimes = new Map<bigint, Date>();
  const occurredAt = async (blockNumber: bigint) => {
    let at = blockTimes.get(blockNumber);
    if (!at) {
      const block = await client.getBlock({ blockNumber });
      at = new Date(Number(block.timestamp) * 1000);
      blockTimes.set(blockNumber, at);
    }
    return at;
  };

  for (const event of events) {
    const idHex = purchaseIdFromPaymentRef(event.paymentRef);
    if (!idHex) {
      console.warn(
        "[payments] AmpedPay log for a paymentRef this server did not mint",
        event.paymentRef
      );
      continue;
    }
    const id = hexToPurchaseId(idHex);
    // A ref minted by another database on the same contract (local and staging share Base
    // Sepolia): skip it, or settlePurchase throws and the cursor never moves again
    const known = await prisma.purchase.findUnique({ where: { id }, select: { id: true } });
    if (!known) {
      console.warn("[payments] AmpedPay log for a purchase this database does not hold", idHex);
      continue;
    }
    if (event.kind === "purchase_paid") {
      // The submit response was lost, or the worker marked it failed too early: the log decides
      const txHash = event.log.transactionHash;
      if (txHash) {
        await prisma.purchase.updateMany({
          // expired too: a Paid log is final, whatever the row said
          where: { id, status: { in: ["submitting", "submitted", "failed", "expired"] } },
          data: { txHash, status: "submitted" },
        });
      }
      await settlePurchase(id, { now });
    } else if (event.kind === "purchase_refunded") {
      // C10: a final product sale also leaves its product's sales count
      const moved = await markRefunded(id, await occurredAt(event.log.blockNumber!));
      if (moved) console.log("[payments] purchase refunded", idHex);
    }
  }
  const written = await recordPaymentLogs(events, occurredAt, contract as Address);
  await writeCursor(range.to);
  return written;
}

/** Moves in flight purchases forward and tidies the rest. Returns the rows looked at. */
export async function settlePendingOnce(now = new Date()): Promise<number> {
  const pending = await prisma.purchase.findMany({
    where: { status: { in: ["submitted", "confirmed_soft"] }, txHash: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  for (const row of pending) {
    try {
      await settlePurchase(row.id, { now });
    } catch (error) {
      console.error("[payments] settle failed", error);
    }
  }

  const unsent = await prisma.purchase.findMany({
    where: {
      status: "confirmed",
      receiptSentAt: null,
      confirmedAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
    take: BATCH,
    select: { id: true },
  });
  for (const row of unsent) {
    await sendPurchaseReceipt(row.id).catch(error =>
      console.error("[payments] receipt email retry failed", error)
    );
  }

  // Nobody signed: the split is past its validity, so it can never be paid
  await prisma.purchase.updateMany({
    where: { status: "prepared", createdAt: { lt: new Date(now.getTime() - PREPARED_TTL_MS) } },
    data: { status: "expired" },
  });
  // The relayer call never returned a hash and the split has expired: it did not leave.
  // A Paid log found later moves it back (indexPaymentLogsOnce)
  await prisma.purchase.updateMany({
    where: {
      status: "submitting",
      txHash: null,
      updatedAt: { lt: new Date(now.getTime() - PREPARED_TTL_MS - SUBMITTING_GRACE_MS) },
    },
    data: { status: "failed", failureCode: "not_sent" },
  });
  return pending.length;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let ticks = 0;

/** Started from bootstrap.ts. No-op until AMPEDPAY_ADDRESS is set. */
export function startPaymentsWorker() {
  if (!env.AMPEDPAY_ADDRESS || timer || process.env.NODE_ENV === "test") return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await settlePendingOnce();
      // MB-1: joins whose submit response was lost
      if (env.AMPEDMEMBERSHIPS_ADDRESS) await settlePendingJoinsOnce();
      if (ticks % LOG_PASS_EVERY === 0) await indexPaymentLogsOnce();
      // AB-1: approved merchant payout wallets take effect 24 hours after approval (M2)
      if (ticks % LOG_PASS_EVERY === 0) await applyDuePayoutWallets();
    } catch (error) {
      console.error("[payments worker] tick failed", error);
    } finally {
      ticks += 1;
      running = false;
    }
  };
  timer = setInterval(() => void tick(), PAYMENTS_WORKER_TICK_MS);
  timer.unref?.();
  void tick();
}
