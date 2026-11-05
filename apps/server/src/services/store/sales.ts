/**
 * Store Sales and refunds (content PR C10, Screen Review row 161, boards st5 and k2;
 * docs/fixes/store-sales.md).
 *
 * Sales reads Purchase rows the creator sold. Buyers show by display name and handle,
 * never email or wallet. A refund returns the full amount to the buyer in one AmpedPay
 * call: the creator approves it with an EIP-712 Refund signature and a USDC permit for
 * everything but Amped.Bio's share, which the treasury returns (content decision 25).
 * Promoter and partner shares are not pulled back on chain. The relayer sends the call;
 * the payments indexer marks the sale refunded when the Refunded log lands, and access
 * ends with it (PURCHASE_ACCESS_STATUSES leaves refunded out).
 */
import {
  encodeFunctionData,
  getAddress,
  isAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { prisma } from "@repo/database";
import { uuidv7 } from "../../utils/uuid-v7";
import {
  REFUND_DEADLINE_SECONDS,
  SALES_PAGE_SIZE,
  csvField,
  salesMonthOf,
  type RefundPrepareResult,
  type RefundSubmitResult,
  type SaleRow,
  type SaleState,
  type SalesPage,
} from "@repo/constants";
import {
  AMPEDPAY_ABI,
  REFUND_TYPES,
  SPLIT_ROLES,
  USDC_NONCES_ABI,
  USDC_PERMIT_TYPES,
  ampedPayDomain,
  purchasePaymentRef,
} from "@repo/web3";
import { getUsdcBalance, paymentChain, paymentClient, usdcDomain } from "../usdc/chain";
import { RelayerError, getRelayer } from "../usdc/relayer";
import { ampedPayAddress } from "../payments/onchain";
import { paymentsReady } from "../payments/ready";
import { paymentSettings } from "../payments/settings";
import { versionSummary, liveVersion } from "./policy";
import { checkRefundPause } from "./promoters";

const BPS = 10_000n;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Sales lists only what was paid: in flight and failed rows are the buyer's business. */
const SOLD_STATUSES = ["confirmed_soft", "confirmed", "refunded"] as const;
const REFUNDABLE_STATUSES = ["confirmed_soft", "confirmed"] as const;

type StoredRecipient = { to: string; bps: number; role: number };

type SaleSource = {
  id: Uint8Array;
  buyerUserId: number | null;
  targetType: string;
  targetId: string;
  offerId: Uint8Array | null;
  amount: bigint;
  fee: bigint;
  split: unknown;
  status: string;
  txHash: string | null;
  softConfirmedAt: Date | null;
  confirmedAt: Date | null;
  refundedAt: Date | null;
  refundRequestedAt: Date | null;
  createdAt: Date;
  storePolicyVersionId: Uint8Array | null;
  chainId: number;
};

const SALE_SELECT = {
  id: true,
  buyerUserId: true,
  targetType: true,
  targetId: true,
  offerId: true,
  amount: true,
  fee: true,
  split: true,
  status: true,
  txHash: true,
  softConfirmedAt: true,
  confirmedAt: true,
  refundedAt: true,
  refundRequestedAt: true,
  createdAt: true,
  storePolicyVersionId: true,
  chainId: true,
} as const;

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

function recipientsOf(split: unknown): StoredRecipient[] {
  const recipients = (split as { recipients?: StoredRecipient[] } | null)?.recipients;
  return Array.isArray(recipients) ? recipients : [];
}

/** What the payment sent where: the same floor rounding as the contract, creator takes the rest. */
export function saleShares(amount: bigint, fee: bigint, split: unknown) {
  let promoter = 0n;
  let partner = 0n;
  for (const r of recipientsOf(split)) {
    const share = (amount * BigInt(r.bps)) / BPS;
    if (r.role === SPLIT_ROLES.promoter) promoter += share;
    if (r.role === SPLIT_ROLES.partner) partner += share;
  }
  const hasPromoter = recipientsOf(split).some(r => r.role === SPLIT_ROLES.promoter);
  return {
    platform: fee,
    promoter: hasPromoter ? promoter : null,
    partner,
    net: amount - fee - promoter - partner,
  };
}

/** When the sale was first seen on chain. */
function paidAt(row: Pick<SaleSource, "softConfirmedAt" | "confirmedAt" | "createdAt">) {
  return row.softConfirmedAt ?? row.confirmedAt ?? row.createdAt;
}

export function saleState(row: Pick<SaleSource, "status" | "refundRequestedAt">): SaleState {
  if (row.status === "refunded") return "refunded";
  if (row.refundRequestedAt) return "refunding";
  return row.status === "confirmed" ? "final" : "pending";
}

export function refundWindowOpen(
  row: Pick<
    SaleSource,
    "status" | "refundRequestedAt" | "softConfirmedAt" | "confirmedAt" | "createdAt"
  >,
  windowDays: number,
  now: Date
) {
  if (!(REFUNDABLE_STATUSES as readonly string[]).includes(row.status)) return false;
  if (row.refundRequestedAt) return false;
  return now.getTime() - paidAt(row).getTime() <= windowDays * DAY_MS;
}

/** Titles and buyers for a page of sales, in two batched reads. */
async function describe(rows: SaleSource[]) {
  const offerIds = rows.filter(r => r.offerId).map(r => Buffer.from(r.offerId!));
  const publicIds = rows.filter(r => r.targetType === "content").map(r => r.targetId);
  const buyerIds = [...new Set(rows.map(r => r.buyerUserId).filter((v): v is number => !!v))];
  const [offers, items, buyers] = await Promise.all([
    offerIds.length
      ? prisma.offer.findMany({
          where: { id: { in: offerIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([] as { id: Uint8Array; title: string }[]),
    publicIds.length
      ? prisma.contentItem.findMany({
          where: { publicId: { in: publicIds } },
          select: { publicId: true, title: true },
        })
      : Promise.resolve([] as { publicId: string; title: string }[]),
    buyerIds.length
      ? prisma.user.findMany({
          where: { id: { in: buyerIds } },
          select: { id: true, name: true, handle: true },
        })
      : Promise.resolve([] as { id: number; name: string | null; handle: string | null }[]),
  ]);
  const offerTitle = new Map(offers.map(o => [hex(o.id), o.title]));
  const itemTitle = new Map(items.map(i => [i.publicId, i.title]));
  const buyer = new Map(buyers.map(b => [b.id, { name: b.name, handle: b.handle }]));
  return (row: SaleSource) => ({
    title:
      (row.offerId ? offerTitle.get(hex(row.offerId)) : itemTitle.get(row.targetId)) ??
      (row.offerId ? "Removed product" : "Removed item"),
    kind: (row.offerId || row.targetType === "offer" ? "product" : "item") as SaleRow["kind"],
    buyer: row.buyerUserId ? (buyer.get(row.buyerUserId) ?? null) : null,
  });
}

/** True when the sale can be refunded from this server: the same chain, inside the window. */
function refundableHere(row: SaleSource, windowDays: number, now: Date): boolean {
  return row.chainId === paymentChain.id && refundWindowOpen(row, windowDays, now);
}

function toRow(
  row: SaleSource,
  info: ReturnType<Awaited<ReturnType<typeof describe>>>,
  windowDays: number,
  now: Date
): SaleRow {
  const shares = saleShares(row.amount, row.fee, row.split);
  return {
    id: hex(row.id),
    buyer: info.buyer,
    title: info.title,
    kind: info.kind,
    amount: row.amount.toString(),
    fee: row.fee.toString(),
    promoter: shares.promoter === null ? null : shares.promoter.toString(),
    net: shares.net.toString(),
    state: saleState(row),
    paidAt: paidAt(row).toISOString(),
    refundedAt: row.refundedAt?.toISOString() ?? null,
    txHash: row.txHash,
    refundable: refundableHere(row, windowDays, now),
  };
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y!, m! - 1, 1)), lt: new Date(Date.UTC(y!, m!, 1)) };
}

/** Sales, newest first, with this month's totals (boards st5 and k2a). */
export async function listSales(
  creatorUserId: number,
  cursor?: string,
  now = new Date()
): Promise<SalesPage> {
  const settings = await paymentSettings(now.getTime());
  const rows = await prisma.purchase.findMany({
    where: {
      creatorUserId,
      status: { in: [...SOLD_STATUSES] },
    },
    ...(cursor ? { cursor: { id: Buffer.from(cursor, "hex") }, skip: 1 } : {}),
    orderBy: { id: "desc" },
    take: SALES_PAGE_SIZE + 1,
    select: SALE_SELECT,
  });
  const page = rows.slice(0, SALES_PAGE_SIZE);
  const info = await describe(page);

  const month = await prisma.purchase.findMany({
    where: {
      creatorUserId,
      status: { in: [...REFUNDABLE_STATUSES] },
      createdAt: monthRange(salesMonthOf(now)),
    },
    select: { amount: true, fee: true, split: true },
  });
  const netThisMonth = month.reduce((sum, r) => sum + saleShares(r.amount, r.fee, r.split).net, 0n);

  return {
    totals: { netThisMonth: netThisMonth.toString(), salesThisMonth: month.length },
    rows: page.map(row => toRow(row, info(row), settings.refundWindowDays, now)),
    nextCursor: rows.length > SALES_PAGE_SIZE ? hex(page[page.length - 1]!.id) : null,
    refundWindowDays: settings.refundWindowDays,
  };
}

export const SALES_CSV_HEADER = [
  "Date (UTC)",
  "Buyer",
  "Buyer handle",
  "Product",
  "Amount USDC",
  "Amped.Bio fee USDC",
  "Promoter USDC",
  "Net USDC",
  "Status",
  "Refunded (UTC)",
  "Transaction",
  "Store policy version",
];

/** USDC units as a plain decimal for a spreadsheet: "17.1" stays exact as "17.100000". */
function usdcPlain(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const text = `${abs / 1_000_000n}.${(abs % 1_000_000n).toString().padStart(6, "0")}`;
  return negative ? `-${text}` : text;
}

/** One month of sales as CSV, with the store policy version of each (ST-Q32, store policy C10). */
export async function salesCsv(creatorUserId: number, month: string): Promise<string> {
  const rows = await prisma.purchase.findMany({
    where: {
      creatorUserId,
      status: { in: [...SOLD_STATUSES] },
      createdAt: monthRange(month),
    },
    orderBy: { id: "asc" },
    take: 10_000,
    select: SALE_SELECT,
  });
  const info = await describe(rows);
  const versionIds = [
    ...new Set(rows.filter(r => r.storePolicyVersionId).map(r => hex(r.storePolicyVersionId!))),
  ];
  const versions = versionIds.length
    ? await prisma.storePolicyVersion.findMany({
        where: { id: { in: versionIds.map(id => Buffer.from(id, "hex")) } },
        select: { id: true, version: true },
      })
    : [];
  const versionOf = new Map(versions.map(v => [hex(v.id), v.version]));
  const lines = [SALES_CSV_HEADER.map(csvField).join(",")];
  for (const row of rows) {
    const d = info(row);
    const shares = saleShares(row.amount, row.fee, row.split);
    lines.push(
      [
        paidAt(row).toISOString(),
        d.buyer?.name ?? "",
        d.buyer?.handle ? `@${d.buyer.handle}` : "",
        d.title,
        usdcPlain(row.amount),
        usdcPlain(row.fee),
        shares.promoter === null ? "" : usdcPlain(shares.promoter),
        usdcPlain(shares.net),
        saleState(row),
        row.refundedAt?.toISOString() ?? "",
        row.txHash ?? "",
        row.storePolicyVersionId ? (versionOf.get(hex(row.storePolicyVersionId)) ?? "") : "",
      ]
        .map(csvField)
        .join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// ------------------------------------------------------------------ refunds

async function ownSale(creatorUserId: number, purchaseId: string) {
  const row = await prisma.purchase.findUnique({
    where: { id: Buffer.from(purchaseId, "hex") },
    select: { ...SALE_SELECT, creatorUserId: true, creatorAddress: true },
  });
  return row && row.creatorUserId === creatorUserId ? row : null;
}

/** The creator's own wallet must be the one the sale paid: only it can approve the refund. */
async function creatorSigner(creatorUserId: number, creatorAddress: string) {
  const wallet = await prisma.userWallet.findUnique({
    where: { userId: creatorUserId },
    select: { address: true },
  });
  if (!wallet?.address || !isAddress(wallet.address, { strict: false })) return null;
  return isAddressEqual(wallet.address as Address, creatorAddress as Address)
    ? getAddress(creatorAddress)
    : null;
}

/** The Refund sheet (board k2b): figures, the store policy summary and the typed data to sign. */
export async function prepareRefund(
  creatorUserId: number,
  purchaseId: string,
  now = new Date()
): Promise<RefundPrepareResult> {
  const row = await ownSale(creatorUserId, purchaseId);
  if (!row) return { refused: true, reason: "not_found" };
  if (row.status === "refunded") return { refused: true, reason: "already_refunded" };
  if (row.refundRequestedAt) return { refused: true, reason: "already_refunded" };
  if (!(REFUNDABLE_STATUSES as readonly string[]).includes(row.status)) {
    return { refused: true, reason: "not_refundable" };
  }
  const settings = await paymentSettings(now.getTime());
  // A sale paid on another chain has no payment on this AmpedPay: the Refunded log would
  // never arrive, so the sale can only be refunded where the payment lives
  if (row.chainId !== paymentChain.id) return { refused: true, reason: "not_refundable" };
  if (!refundWindowOpen(row, settings.refundWindowDays, now)) {
    return { refused: true, reason: "window_closed" };
  }
  const contract = ampedPayAddress();
  if (!contract || !paymentsReady() || settings.paymentsPaused) {
    return { refused: true, reason: "paused" };
  }
  const signer = await creatorSigner(creatorUserId, row.creatorAddress);
  if (!signer) return { refused: true, reason: "wallet_changed" };

  const fromWallet = row.amount - row.fee;
  const balance = await getUsdcBalance(signer);
  if (balance < fromWallet) {
    return {
      refused: true,
      reason: "insufficient_balance",
      shortBy: (fromWallet - balance).toString(),
    };
  }

  const usdc = await usdcDomain();
  const nonce = await paymentClient().readContract({
    address: usdc.verifyingContract as Address,
    abi: USDC_NONCES_ABI,
    functionName: "nonces",
    args: [signer],
  });
  const deadline = BigInt(Math.floor(now.getTime() / 1000) + REFUND_DEADLINE_SECONDS);
  const shares = saleShares(row.amount, row.fee, row.split);
  const [info, live] = await Promise.all([describe([row]), liveVersion(creatorUserId)]);
  const d = info(row);

  return {
    refused: false,
    quote: {
      purchaseId,
      buyerName: d.buyer?.name || (d.buyer?.handle ? `@${d.buyer.handle}` : "the buyer"),
      title: d.title,
      amount: row.amount.toString(),
      fromWallet: fromWallet.toString(),
      ampedReturns: row.fee.toString(),
      notPulledBack: ((shares.promoter ?? 0n) + shares.partner).toString(),
      balanceAfter: (balance - fromWallet).toString(),
      policySummary: live ? versionSummary(live).summary : null,
      signer,
      typed: {
        refund: {
          domain: ampedPayDomain(paymentChain.id, contract),
          message: { paymentRef: purchasePaymentRef(row.id), deadline: deadline.toString() },
        },
        permit: {
          domain: {
            name: usdc.name,
            version: usdc.version,
            chainId: paymentChain.id,
            verifyingContract: usdc.verifyingContract as `0x${string}`,
          },
          message: {
            owner: signer,
            spender: contract,
            value: fromWallet.toString(),
            nonce: nonce.toString(),
            deadline: deadline.toString(),
          },
        },
      },
    },
  };
}

export function encodeRefundCall(input: {
  paymentRef: Hex;
  deadline: bigint;
  refundSignature: Hex;
  permitDeadline: bigint;
  permitSignature: Hex;
}): Hex {
  return encodeFunctionData({
    abi: AMPEDPAY_ABI,
    functionName: "refund",
    args: [
      input.paymentRef,
      input.deadline,
      input.refundSignature,
      input.permitDeadline,
      input.permitSignature,
    ],
  });
}

/**
 * Sends a refund the creator approved. Both signatures are checked here first, so a bad
 * one never costs the relayer gas. The row is claimed before sending, so a double tap
 * sends once. A relayer failure releases the claim; nothing left the creator's wallet.
 */
export async function submitRefund(
  creatorUserId: number,
  input: {
    purchaseId: string;
    deadline: string;
    refundSignature: string;
    permitDeadline: string;
    permitSignature: string;
  },
  now = new Date()
): Promise<RefundSubmitResult> {
  const row = await ownSale(creatorUserId, input.purchaseId);
  if (!row) return { refused: true, reason: "not_found" };
  if (row.status === "refunded") return { refused: false, state: "refunded", txHash: null };
  if (row.refundRequestedAt) return { refused: false, state: "refunding", txHash: null };
  const settings = await paymentSettings(now.getTime());
  // A sale paid on another chain has no payment on this AmpedPay: refunding it here would
  // revert on chain, so only the chain that took the payment can refund it
  if (row.chainId !== paymentChain.id) return { refused: true, reason: "not_refundable" };
  if (!refundWindowOpen(row, settings.refundWindowDays, now)) {
    return { refused: true, reason: "window_closed" };
  }
  const contract = ampedPayAddress();
  if (!contract || !paymentsReady() || settings.paymentsPaused) {
    return { refused: true, reason: "paused" };
  }
  const signer = await creatorSigner(creatorUserId, row.creatorAddress);
  if (!signer) return { refused: true, reason: "wallet_changed" };

  const deadline = BigInt(input.deadline);
  const permitDeadline = BigInt(input.permitDeadline);
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
  if (deadline <= nowSeconds || permitDeadline <= nowSeconds) {
    return { refused: true, reason: "signature" };
  }
  const paymentRef = purchasePaymentRef(row.id);
  const fromWallet = row.amount - row.fee;
  const usdc = await usdcDomain();
  const nonce = await paymentClient().readContract({
    address: usdc.verifyingContract as Address,
    abi: USDC_NONCES_ABI,
    functionName: "nonces",
    args: [signer],
  });
  try {
    const [refundSigner, permitSigner] = await Promise.all([
      recoverTypedDataAddress({
        domain: ampedPayDomain(paymentChain.id, contract),
        types: REFUND_TYPES,
        primaryType: "Refund",
        message: { paymentRef, deadline },
        signature: input.refundSignature as Hex,
      }),
      recoverTypedDataAddress({
        domain: {
          name: usdc.name,
          version: usdc.version,
          chainId: paymentChain.id,
          verifyingContract: usdc.verifyingContract as Address,
        },
        types: USDC_PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: signer,
          spender: contract,
          value: fromWallet,
          nonce,
          deadline: permitDeadline,
        },
        signature: input.permitSignature as Hex,
      }),
    ]);
    if (!isAddressEqual(refundSigner, signer) || !isAddressEqual(permitSigner, signer)) {
      return { refused: true, reason: "signature" };
    }
  } catch {
    return { refused: true, reason: "signature" };
  }

  const balance = await getUsdcBalance(signer);
  if (balance < fromWallet) return { refused: true, reason: "insufficient_balance" };

  const claimed = await prisma.purchase.updateMany({
    where: {
      id: row.id,
      status: { in: [...REFUNDABLE_STATUSES] },
      refundRequestedAt: null,
    },
    data: { refundRequestedAt: now },
  });
  if (claimed.count === 0) return { refused: false, state: "refunding", txHash: null };

  let txHash: Hex;
  try {
    txHash = await getRelayer().call(
      contract,
      encodeRefundCall({
        paymentRef,
        deadline,
        refundSignature: input.refundSignature as Hex,
        permitDeadline,
        permitSignature: input.permitSignature as Hex,
      }),
      `refund:${input.purchaseId}`
    );
  } catch (error) {
    await prisma.purchase.updateMany({
      where: { id: row.id, status: { not: "refunded" } },
      data: { refundRequestedAt: null },
    });
    const code = error instanceof RelayerError ? error.code : "unavailable";
    console.warn("[store] refund not sent", input.purchaseId, code);
    return { refused: true, reason: "relayer" };
  }
  await prisma.purchase.update({ where: { id: row.id }, data: { refundTxHash: txHash } });
  console.info("[store] refund sent", input.purchaseId, txHash);
  return { refused: false, state: "refunding", txHash };
}

/**
 * Marks a sale refunded once its Refunded log is seen (payments worker). A sale that was
 * final leaves its product's sales count. Returns true when this call moved it.
 */
export async function markRefunded(id: Uint8Array, refundedAt: Date): Promise<boolean> {
  const wasFinal = await prisma.purchase.updateMany({
    where: { id: Buffer.from(id), status: "confirmed" },
    data: { status: "refunded", refundedAt },
  });
  const other =
    wasFinal.count === 0
      ? await prisma.purchase.updateMany({
          where: { id: Buffer.from(id), status: { not: "refunded" } },
          data: { status: "refunded", refundedAt },
        })
      : { count: 0 };
  if (wasFinal.count) {
    const row = await prisma.purchase.findUnique({
      where: { id: Buffer.from(id) },
      select: { offerId: true },
    });
    if (row?.offerId) {
      await prisma.offer.updateMany({
        where: { id: Buffer.from(row.offerId), salesCount: { gt: 0 } },
        data: { salesCount: { decrement: 1 } },
      });
    }
  }
  const moved = wasFinal.count + other.count > 0;
  if (moved) {
    // C12: a code whose refunds pass the pause rate in 30 days pauses for the creator
    const sale = await prisma.purchase.findUnique({
      where: { id: Buffer.from(id) },
      select: { promoterCodeId: true },
    });
    if (sale?.promoterCodeId) {
      await checkRefundPause(sale.promoterCodeId, refundedAt).catch(error =>
        console.warn(
          "[store] promoter refund check failed",
          error instanceof Error ? error.message : error
        )
      );
    }
  }
  return moved;
}

/** A product sale that just became final counts once on its product (Offer.salesCount). */
export async function countFinalSale(id: Uint8Array): Promise<void> {
  const row = await prisma.purchase.findUnique({
    where: { id: Buffer.from(id) },
    select: { offerId: true },
  });
  if (row?.offerId) {
    await prisma.offer.updateMany({
      where: { id: Buffer.from(row.offerId) },
      data: { salesCount: { increment: 1 } },
    });
  }
}

/**
 * Report store (store policy 3.4, SP-Q48): one ContentReport row naming the store, for the
 * Safety queue. The caller has already checked the store is visible to the reporter.
 */
export async function reportStore(input: {
  creatorUserId: number;
  reporterUserId: number | null;
  reason: string;
  details?: string;
}): Promise<{ received: true }> {
  await prisma.contentReport.create({
    data: {
      id: uuidv7(),
      storeUserId: input.creatorUserId,
      reporterUserId: input.reporterUserId,
      reason: input.reason,
      details: input.details || null,
    },
  });
  console.info(
    "[store] report",
    JSON.stringify({ store: input.creatorUserId, reason: input.reason })
  );
  return { received: true };
}
