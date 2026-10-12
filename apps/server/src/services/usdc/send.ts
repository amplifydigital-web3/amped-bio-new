import { getAddress, isAddress, isAddressEqual, zeroAddress, type Address, type Hex } from "viem";
import { prisma } from "@repo/database";
import { SITE_SETTINGS, USDC_SEND_LIMITS, type UsdcSendRefusal } from "@repo/constants";
import { parseUsdc } from "@repo/web3";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import {
  buildTransferAuthorization,
  isSignedBy,
  toTypedDataPayload,
  type TransferAuthorization,
  type TypedDataPayload,
} from "./authorization";
import { getUsdcBalance, paymentChain, paymentClient, usdcAddress, usdcDomain } from "./chain";
import { recordUsdcTransfers, transfersFromLogs } from "./events";
import { COUNTED_SEND_STATUSES, startOfUtcDay, withinDailyLimits } from "./limits";
import { RelayerError, getRelayer, isRelayerConfigured } from "./relayer";
import { ScreeningUnavailableError, screenAddress, type ScreeningResult } from "./screen";

/**
 * Gasless USDC send (spec 3.4 and 3.5, acceptance 3, 5, 6 and 14).
 *
 * prepare: checks the pause switch, the wallet, verified email, the
 * recipient, today's limits and the balance, screens both addresses, stores a
 * UsdcSend in `screened` and returns the EIP-3009 typed data to sign.
 * submit: re-checks the pause and limits, verifies the signature, claims the
 * row (screened to submitting, so a double tap submits once) and hands it to
 * the CDP relayer. The chain decides the final state.
 */

export type PrepareResult =
  | { refused: true; reason: UsdcSendRefusal }
  | {
      refused: false;
      sendId: string;
      typedData: TypedDataPayload;
      review: {
        amount: string;
        to: Address;
        toUserId: number | null;
        chainId: number;
        network: string;
        validBefore: string;
        unscreened: boolean;
      };
    };

export type SubmitResult =
  | { refused: true; reason: UsdcSendRefusal }
  | { refused: false; status: "submitted" | "confirmed" | "failed"; txHash: Hex | null };

export class SendInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SendInputError";
  }
}

async function sendsPaused(): Promise<boolean> {
  if (!env.USDC_ENABLED || !isRelayerConfigured()) return true;
  const setting = await prisma.siteSettings.findUnique({
    where: { setting_key: SITE_SETTINGS.USDC_SENDS_PAUSED },
  });
  return setting?.setting_value === "true";
}

async function today(userId: number, now: Date) {
  const where = {
    userId,
    chainId: paymentChain.id,
    status: { in: [...COUNTED_SEND_STATUSES] },
    createdAt: { gte: startOfUtcDay(now) },
  };
  const [count, sum] = await Promise.all([
    prisma.usdcSend.count({ where }),
    prisma.usdcSend.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { count, units: sum._sum.amount ?? 0n };
}

function screeningJson(result: ScreeningResult) {
  return {
    checkedBy: result.checkedBy,
    deniedBy: result.deniedBy ?? null,
    reference: result.reference ?? null,
    unscreened: result.unscreened ?? false,
  };
}

async function recordRefusal(params: {
  userId: number;
  from: Address;
  to: Address;
  amount: bigint;
  reason: UsdcSendRefusal;
  screening?: ScreeningResult;
  now: Date;
}) {
  await prisma.usdcSend.create({
    data: {
      id: uuidv7(),
      userId: params.userId,
      chainId: paymentChain.id,
      fromAddress: params.from,
      toAddress: params.to,
      amount: params.amount,
      nonce: `refused:${uuidv7().toString("hex")}`,
      validBefore: params.now,
      status: "refused",
      failureCode: params.reason,
      screening: params.screening ? screeningJson(params.screening) : { reason: params.reason },
    },
  });
}

export async function prepareUsdcSend(
  userId: number,
  input: { to: string; amount: string },
  now = new Date()
): Promise<PrepareResult> {
  if (await sendsPaused()) return { refused: true, reason: "paused" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email_verified: true, wallet: { select: { address: true } } },
  });
  if (!user?.wallet?.address) return { refused: true, reason: "no_wallet" };
  if (!user.email_verified) return { refused: true, reason: "email_unverified" };
  const from = getAddress(user.wallet.address);

  if (!isAddress(input.to, { strict: false }))
    return { refused: true, reason: "invalid_recipient" };
  const to = getAddress(input.to);
  if (
    isAddressEqual(to, from) ||
    isAddressEqual(to, zeroAddress) ||
    isAddressEqual(to, usdcAddress())
  ) {
    return { refused: true, reason: "invalid_recipient" };
  }

  const amount = parseUsdc(input.amount);
  if (amount === null)
    throw new SendInputError("Enter an amount above 0 with up to 6 decimal places.");

  if (!withinDailyLimits(await today(userId, now), amount)) {
    await recordRefusal({ userId, from, to, amount, reason: "limit", now });
    return { refused: true, reason: "limit" };
  }

  if ((await getUsdcBalance(from)) < amount)
    return { refused: true, reason: "insufficient_balance" };

  let own: ScreeningResult;
  let destination: ScreeningResult;
  try {
    own = await screenAddress(from, "own_address", userId);
    destination = own.allowed ? await screenAddress(to, "send_destination", userId) : own;
  } catch (error) {
    if (error instanceof ScreeningUnavailableError) return { refused: true, reason: "paused" };
    throw error;
  }
  if (!own.allowed || !destination.allowed) {
    await recordRefusal({
      userId,
      from,
      to,
      amount,
      reason: "screening",
      screening: own.allowed ? destination : own,
      now,
    });
    return { refused: true, reason: "screening" };
  }

  const auth = buildTransferAuthorization({
    from,
    to,
    value: amount,
    now,
    ttlSeconds: USDC_SEND_LIMITS.authorizationTtlSeconds,
  });
  const recipient = await prisma.userWallet.findFirst({
    where: { address: { in: [to, to.toLowerCase()] } },
    select: { userId: true },
  });
  const id = uuidv7();
  await prisma.usdcSend.create({
    data: {
      id,
      userId,
      chainId: paymentChain.id,
      fromAddress: from,
      toAddress: to,
      toUserId: recipient?.userId ?? null,
      amount,
      nonce: auth.nonce,
      validBefore: new Date(Number(auth.validBefore) * 1000),
      status: "screened",
      screening: screeningJson(destination),
    },
  });

  return {
    refused: false,
    sendId: id.toString("hex"),
    typedData: toTypedDataPayload(await usdcDomain(), auth),
    review: {
      amount: amount.toString(),
      to,
      toUserId: recipient?.userId ?? null,
      chainId: paymentChain.id,
      network: paymentChain.name,
      validBefore: new Date(Number(auth.validBefore) * 1000).toISOString(),
      unscreened: destination.unscreened ?? false,
    },
  };
}

type SendRow = NonNullable<Awaited<ReturnType<typeof prisma.usdcSend.findFirst>>>;

function authorizationOf(row: SendRow): TransferAuthorization {
  return {
    from: getAddress(row.fromAddress),
    to: getAddress(row.toAddress),
    value: row.amount,
    validAfter: 0n,
    validBefore: BigInt(Math.floor(row.validBefore.getTime() / 1000)),
    nonce: row.nonce as Hex,
  };
}

function parseSendId(sendId: string): Buffer {
  if (!/^[0-9a-f]{32}$/.test(sendId)) throw new SendInputError("Unknown send.");
  return Buffer.from(sendId, "hex");
}

async function findSend(userId: number, sendId: string) {
  const row = await prisma.usdcSend.findFirst({ where: { id: parseSendId(sendId), userId } });
  if (!row) throw new SendInputError("Unknown send.");
  return row;
}

/** Reads the receipt once; writes the final state and the PaymentEvent rows. */
async function settle(row: SendRow, txHash: Hex, waitMs: number) {
  try {
    const receipt =
      waitMs > 0
        ? await paymentClient().waitForTransactionReceipt({ hash: txHash, timeout: waitMs })
        : await paymentClient().getTransactionReceipt({ hash: txHash });
    const status = receipt.status === "success" ? "confirmed" : "failed";
    await prisma.usdcSend.update({
      where: { id: row.id },
      data: { status, failureCode: status === "failed" ? "reverted" : null },
    });
    if (status === "confirmed") {
      const block = await paymentClient().getBlock({ blockNumber: receipt.blockNumber });
      await recordUsdcTransfers(
        transfersFromLogs(receipt.logs),
        () => new Date(Number(block.timestamp) * 1000)
      );
    }
    return status;
  } catch {
    // Not mined yet: the status poll and the indexer finish it
    return "submitted" as const;
  }
}

export async function submitUsdcSend(
  userId: number,
  input: { sendId: string; signature: Hex },
  now = new Date(),
  receiptWaitMs = 20_000
): Promise<SubmitResult> {
  const row = await findSend(userId, input.sendId);
  if (row.status !== "screened") {
    // A second tap or a retry after a lost response: report what happened
    if (row.status === "submitting" || row.status === "submitted" || row.status === "confirmed") {
      return {
        refused: false,
        status: row.status === "confirmed" ? "confirmed" : "submitted",
        txHash: (row.txHash as Hex | null) ?? null,
      };
    }
    throw new SendInputError("This send can no longer be submitted. Start again.");
  }
  if (row.validBefore.getTime() <= now.getTime()) {
    await prisma.usdcSend.update({ where: { id: row.id }, data: { status: "expired" } });
    throw new SendInputError("This send expired. Start again.");
  }
  if (await sendsPaused()) return { refused: true, reason: "paused" };
  if (!withinDailyLimits(await today(userId, now), row.amount)) {
    await prisma.usdcSend.update({
      where: { id: row.id },
      data: { status: "refused", failureCode: "limit" },
    });
    return { refused: true, reason: "limit" };
  }
  // Funds can leave between prepare and submit; the contract would revert and
  // the relayer would pay that gas for a guaranteed failure. Re-check first.
  if ((await getUsdcBalance(row.fromAddress as `0x${string}`)) < row.amount) {
    await prisma.usdcSend.update({
      where: { id: row.id },
      data: { status: "refused", failureCode: "insufficient_balance" },
    });
    return { refused: true, reason: "insufficient_balance" };
  }

  const auth = authorizationOf(row);
  if (!(await isSignedBy(await usdcDomain(), auth, input.signature))) {
    throw new SendInputError("The signature does not match this send. Start again.");
  }

  const claimed = await prisma.usdcSend.updateMany({
    where: { id: row.id, status: "screened" },
    data: { status: "submitting" },
  });
  if (claimed.count === 0) return { refused: false, status: "submitted", txHash: null };

  let txHash: Hex;
  try {
    txHash = await getRelayer().submit(auth, input.signature, Buffer.from(row.id).toString("hex"));
  } catch (error) {
    const code = error instanceof RelayerError ? error.code : "unavailable";
    await prisma.usdcSend.update({
      where: { id: row.id },
      data: { status: "failed", failureCode: code },
    });
    if (code === "reverted") return { refused: false, status: "failed", txHash: null };
    return { refused: true, reason: "paused" };
  }

  await prisma.usdcSend.update({ where: { id: row.id }, data: { status: "submitted", txHash } });
  const status = await settle(row, txHash, receiptWaitMs);
  return { refused: false, status, txHash };
}

export async function usdcSendStatus(userId: number, sendId: string) {
  const row = await findSend(userId, sendId);
  let status = row.status;
  if (status === "submitted" && row.txHash) {
    status = await settle(row, row.txHash as Hex, 0);
  }
  return {
    status,
    txHash: row.txHash,
    amount: row.amount.toString(),
    to: row.toAddress,
    chainId: row.chainId,
  };
}

/**
 * First time the fan opens USDC on Base (spec 3.2): stamps the user so the
 * indexer watches the address, and screens it once. A deny is recorded for
 * the admin; the fan sees nothing until a send.
 */
export async function markUsdcWalletSeen(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { usdc_wallet_seen_at: true, wallet: { select: { address: true } } },
  });
  if (!user || user.usdc_wallet_seen_at) return { firstTime: false };
  await prisma.user.update({ where: { id: userId }, data: { usdc_wallet_seen_at: new Date() } });
  if (user.wallet?.address) {
    await screenAddress(user.wallet.address, "own_address", userId).catch(error => {
      console.warn("[usdc] first use screening did not run", error);
    });
  }
  return { firstTime: true };
}
