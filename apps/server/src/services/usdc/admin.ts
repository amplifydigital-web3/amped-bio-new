import {
  formatEther,
  formatUnits,
  getAddress,
  isAddressEqual,
  isHash,
  parseEther,
  type Hex,
} from "viem";
import { prisma } from "@repo/database";
import { SITE_SETTINGS, USDC_SEND_LIMITS } from "@repo/constants";
import { USDC_DECIMALS } from "@repo/web3";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentChain, paymentClient } from "./chain";
import { startOfUtcDay } from "./limits";
import { getRelayer, isRelayerConfigured } from "./relayer";

/**
 * Admin, Money (spec 3.8, Build Board #29 USDC-3). Amped.Bio pays Base gas
 * for every gasless send, so the admin sees what it costs, how long the
 * relayer's ETH lasts, every top up, today's sends against the limits, the
 * screening denies, and the Pause USDC sends switch.
 *
 * Each environment has its own relayer account (CDP_RELAYER_ACCOUNT) and
 * reads only its own payment chain, so staging and production ledgers never
 * mix.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Days the relayer's ETH lasts at the last 7 days' average spend. Null when
 * nothing was spent, so a quiet week never reads as infinite runway.
 */
export function runwayDays(balanceWei: bigint, spentLast7DaysWei: bigint): number | null {
  if (spentLast7DaysWei <= 0n) return null;
  const perDay = Number(spentLast7DaysWei) / 7;
  return Math.floor(Number(balanceWei) / perDay);
}

/** Gas in USD as a share of USDC moved, in percent with two decimals. Null without a price or volume. */
export function gasShareOfVolume(
  gasWei: bigint,
  ethUsd: number | null,
  volumeUnits: bigint
): number | null {
  if (ethUsd === null || volumeUnits <= 0n) return null;
  const gasUsd = Number(formatEther(gasWei)) * ethUsd;
  const volumeUsd = Number(formatUnits(volumeUnits, USDC_DECIMALS));
  return Math.round((gasUsd / volumeUsd) * 10_000) / 100;
}

let priceCache: { value: number | null; at: number } | null = null;

/** Test seam. */
export function clearEthPriceCacheForTests() {
  priceCache = null;
}

/**
 * ETH in USD from Coinbase's public spot price, cached five minutes. Used only
 * to show gas as a share of USDC volume; nothing is charged from it.
 */
export async function ethUsdPrice(now = Date.now()): Promise<number | null> {
  if (priceCache && now - priceCache.at < 5 * 60 * 1000) return priceCache.value;
  let value: number | null = null;
  try {
    const response = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const json = (await response.json()) as { data?: { amount?: string } };
      const parsed = Number(json.data?.amount);
      value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  } catch (error) {
    console.warn("[usdc admin] ETH price did not load", error);
  }
  priceCache = { value, at: now };
  return value;
}

async function sumGas(since: Date) {
  const result = await prisma.usdcSend.aggregate({
    where: { chainId: paymentChain.id, createdAt: { gte: since }, gasCostWei: { not: null } },
    _sum: { gasCostWei: true },
    _count: { _all: true },
  });
  return { wei: result._sum.gasCostWei ?? 0n, count: result._count._all };
}

async function sumVolume(since: Date) {
  const result = await prisma.usdcSend.aggregate({
    where: { chainId: paymentChain.id, createdAt: { gte: since }, status: "confirmed" },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0n;
}

export async function sendsPausedSetting(): Promise<boolean> {
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: SITE_SETTINGS.USDC_SENDS_PAUSED },
  });
  return row?.setting_value === "true";
}

export async function setSendsPaused(paused: boolean) {
  await prisma.siteSettings.upsert({
    where: { setting_key: SITE_SETTINGS.USDC_SENDS_PAUSED },
    create: {
      setting_key: SITE_SETTINGS.USDC_SENDS_PAUSED,
      setting_value: String(paused),
      value_type: "BOOLEAN",
    },
    update: { setting_value: String(paused), value_type: "BOOLEAN" },
  });
  console.info(`[usdc admin] USDC sends ${paused ? "paused" : "resumed"}`);
  return { paused };
}

async function relayerState() {
  if (!isRelayerConfigured()) return { configured: false as const };
  try {
    const relayer = getRelayer();
    const [address, gas] = await Promise.all([relayer.address(), relayer.gas()]);
    return {
      configured: true as const,
      reachable: true as const,
      address,
      balanceWei: gas.wei.toString(),
      balanceEth: gas.eth,
      alarm: gas.alarm,
      stopped: gas.stopped,
    };
  } catch (error) {
    console.error("[usdc admin] relayer state did not load", error);
    return { configured: true as const, reachable: false as const };
  }
}

export async function moneyOverview(now = new Date()) {
  const today = startOfUtcDay(now);
  const month = startOfUtcMonth(now);
  const week = new Date(now.getTime() - 7 * DAY_MS);

  const [
    relayer,
    paused,
    gasToday,
    gasMonth,
    gasWeek,
    volumeMonth,
    sendsToday,
    refusedToday,
    price,
  ] = await Promise.all([
    relayerState(),
    sendsPausedSetting(),
    sumGas(today),
    sumGas(month),
    sumGas(week),
    sumVolume(month),
    prisma.usdcSend.aggregate({
      where: {
        chainId: paymentChain.id,
        createdAt: { gte: today },
        status: { in: ["submitting", "submitted", "confirmed"] },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.usdcSend.count({
      where: { chainId: paymentChain.id, createdAt: { gte: today }, status: "refused" },
    }),
    ethUsdPrice(now.getTime()),
  ]);

  const balanceWei = relayer.configured && relayer.reachable ? BigInt(relayer.balanceWei) : null;

  return {
    network: paymentChain.name,
    chainId: paymentChain.id,
    explorerUrl: paymentChain.blockExplorers?.default.url ?? null,
    enabled: env.USDC_ENABLED,
    paused,
    relayer,
    gasLines: { alarmEth: env.RELAYER_GAS_ALARM_ETH, stopEth: env.RELAYER_GAS_STOP_ETH },
    runwayDays: balanceWei === null ? null : runwayDays(balanceWei, gasWeek.wei),
    gas: {
      todayWei: gasToday.wei.toString(),
      todaySends: gasToday.count,
      monthWei: gasMonth.wei.toString(),
      monthSends: gasMonth.count,
      perSendWei: gasMonth.count > 0 ? (gasMonth.wei / BigInt(gasMonth.count)).toString() : null,
      ethUsd: price,
      shareOfVolumePct: gasShareOfVolume(gasMonth.wei, price, volumeMonth),
      volumeMonthUnits: volumeMonth.toString(),
    },
    sendsToday: {
      count: sendsToday._count._all,
      units: (sendsToday._sum.amount ?? 0n).toString(),
      refused: refusedToday,
    },
    limits: {
      dailyCount: USDC_SEND_LIMITS.dailyCount,
      dailyUnits: USDC_SEND_LIMITS.dailyUnits.toString(),
    },
    screening: {
      circle: Boolean(env.CIRCLE_API_KEY),
      oracle: Boolean(env.CHAINALYSIS_ORACLE),
      denylist: env.USDC_SCREEN_DENYLIST.split(",").filter(entry => entry.trim()).length,
      required: env.USDC_SCREENING_REQUIRED,
    },
  };
}

async function handles(userIds: number[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map<number, string | null>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, handle: true },
  });
  return new Map(users.map(user => [user.id, user.handle]));
}

export async function recentSends(params: { status?: string; limit: number; before?: Date }) {
  const rows = await prisma.usdcSend.findMany({
    where: {
      chainId: paymentChain.id,
      ...(params.status ? { status: params.status } : {}),
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit,
  });
  const names = await handles(rows.flatMap(row => [row.userId, row.toUserId ?? 0]));
  return rows.map(row => ({
    id: Buffer.from(row.id).toString("hex"),
    createdAt: row.createdAt.toISOString(),
    // Handles only, no other fan PII (spec 3.8)
    fromHandle: names.get(row.userId) ?? null,
    toHandle: row.toUserId ? (names.get(row.toUserId) ?? null) : null,
    toAddress: row.toAddress,
    amount: row.amount.toString(),
    status: row.status,
    failureCode: row.failureCode,
    txHash: row.txHash,
    gasCostWei: row.gasCostWei?.toString() ?? null,
    unscreened: Boolean((row.screening as { unscreened?: boolean } | null)?.unscreened),
  }));
}

export async function screeningDenies(limit: number) {
  const rows = await prisma.screeningEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const names = await handles(rows.map(row => row.userId ?? 0));
  return rows.map(row => ({
    id: Buffer.from(row.id).toString("hex"),
    createdAt: row.createdAt.toISOString(),
    handle: row.userId ? (names.get(row.userId) ?? null) : null,
    address: row.address,
    context: row.context,
    vendor: row.vendor,
    reference: row.reference,
  }));
}

export async function fundingEvents(limit: number) {
  const rows = await prisma.relayerFundingEvent.findMany({
    where: { chainId: paymentChain.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(row => ({
    id: Buffer.from(row.id).toString("hex"),
    createdAt: row.createdAt.toISOString(),
    txHash: row.txHash,
    fromAddress: row.fromAddress,
    amountWei: row.amountWei.toString(),
    verified: row.verified,
    note: row.note,
  }));
}

export class FundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FundingError";
  }
}

/**
 * Records a relayer top up by transaction hash. A direct transfer is read
 * from the transaction. A transfer inside a contract call (a Safe multisig)
 * is read from the relayer's balance change in that block; when the RPC
 * cannot read past balances, the admin's amount is stored as unverified.
 */
export async function recordFunding(params: {
  txHash: string;
  note?: string;
  amountEth?: string;
  adminUserId: number;
}) {
  if (!isHash(params.txHash))
    throw new FundingError("Enter a transaction hash (0x and 64 characters).");
  const txHash = params.txHash.toLowerCase() as Hex;
  if (!isRelayerConfigured()) throw new FundingError("The relayer is not configured.");

  const existing = await prisma.relayerFundingEvent.findFirst({
    where: { chainId: paymentChain.id, txHash },
  });
  if (existing) throw new FundingError("This top up is already recorded.");

  const relayerAddress = await getRelayer().address();
  const client = paymentClient();
  let receipt;
  let transaction;
  try {
    [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash: txHash }),
      client.getTransaction({ hash: txHash }),
    ]);
  } catch {
    throw new FundingError(`No confirmed transaction with this hash on ${paymentChain.name}.`);
  }
  if (receipt.status !== "success") throw new FundingError("That transaction failed on chain.");

  let amountWei: bigint | null = null;
  let verified = true;
  if (transaction.to && isAddressEqual(transaction.to, relayerAddress) && transaction.value > 0n) {
    amountWei = transaction.value;
  } else {
    // Contract call (multisig): the relayer's balance change across the block
    try {
      const [after, before] = await Promise.all([
        client.getBalance({ address: relayerAddress, blockNumber: receipt.blockNumber }),
        client.getBalance({ address: relayerAddress, blockNumber: receipt.blockNumber - 1n }),
      ]);
      if (after > before) amountWei = after - before;
    } catch {
      // The RPC keeps no past state; fall back to the admin's amount
    }
    if (amountWei === null) {
      if (!params.amountEth || !/^\d+(\.\d{1,18})?$/.test(params.amountEth)) {
        throw new FundingError(
          "The amount could not be read from the chain. Enter the ETH amount sent to the relayer."
        );
      }
      amountWei = parseEther(params.amountEth);
      verified = false;
    }
  }
  if (amountWei === null || amountWei <= 0n) {
    throw new FundingError("That transaction did not add ETH to the relayer.");
  }
  // The column is BIGINT, which tops out at 2^63 - 1 wei (about 9.22 ETH).
  // Reject anything larger here instead of letting the insert overflow.
  const MAX_BIGINT_WEI = (1n << 63n) - 1n;
  if (amountWei > MAX_BIGINT_WEI) {
    throw new FundingError(
      "The top up exceeds the largest amount the gas ledger can store (9.22 ETH). Split it into smaller top ups."
    );
  }

  await prisma.relayerFundingEvent.create({
    data: {
      id: uuidv7(),
      chainId: paymentChain.id,
      txHash,
      fromAddress: getAddress(transaction.from),
      toAddress: relayerAddress,
      amountWei,
      blockNumber: receipt.blockNumber,
      verified,
      note: params.note?.trim().slice(0, 255) || null,
      recordedBy: params.adminUserId,
    },
  });
  return { amountWei: amountWei.toString(), verified };
}
