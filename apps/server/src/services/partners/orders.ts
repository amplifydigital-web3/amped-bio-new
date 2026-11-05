import { getAddress, isAddress, type Address } from "viem";
import { prisma, type Prisma } from "@repo/database";
import { FULFILLMENT_STATES, type FulfillmentState } from "@repo/constants";
import { purchasePaymentRef } from "@repo/web3";
import { paymentChain, usdcAddress } from "../usdc/chain";
import { splitFromStored, splitShares, type StoredSplit } from "../payments/split";

/**
 * Orders for the Partner API and webhooks (Build Board #66, AB-4; partner spec 9.3 and 9.4). An
 * order is a Purchase of one of the merchant's service offers. order_ref is the Purchase id in
 * hex; payment_ref is the bytes32 the contract stores (purchasePaymentRef).
 */

export class OrderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const ORDER_STATUSES: Record<string, string> = {
  confirmed_soft: "paid",
  confirmed: "finalized",
  refunded: "refunded",
  expired: "expired",
  failed: "expired",
};

const ORDER_SELECT = {
  id: true,
  merchantId: true,
  offerId: true,
  buyerUserId: true,
  payer: true,
  amount: true,
  fee: true,
  split: true,
  status: true,
  chainId: true,
  txHash: true,
  blockNumber: true,
  fulfillmentState: true,
  rnsName: true,
  createdAt: true,
  softConfirmedAt: true,
  confirmedAt: true,
  refundedAt: true,
  accessUntil: true,
} satisfies Prisma.PurchaseSelect;

type OrderRow = Prisma.PurchaseGetPayload<{ select: typeof ORDER_SELECT }>;

async function productCodes(rows: OrderRow[]) {
  const ids = [
    ...new Set(rows.map(r => r.offerId && Buffer.from(r.offerId).toString("hex")).filter(Boolean)),
  ] as string[];
  const offers = ids.length
    ? await prisma.offer.findMany({
        where: { id: { in: ids.map(id => Buffer.from(id, "hex")) } },
        select: { id: true, externalCode: true },
      })
    : [];
  return new Map(offers.map(o => [Buffer.from(o.id).toString("hex"), o.externalCode]));
}

/** The order object (partner spec 9.3). Exported for tests. */
export function orderObject(row: OrderRow, code: string | null) {
  const ref = Buffer.from(row.id).toString("hex");
  const stored = row.split as unknown as StoredSplit;
  const shares = splitShares(
    splitFromStored(stored, {
      paymentRef: purchasePaymentRef(row.id),
      payer: getAddress(row.payer),
      amount: row.amount,
    })
  ).map(s => ({
    role:
      s.role === 4 ? "merchant" : s.role === 1 ? "platform" : s.role === 0 ? "creator" : "other",
    to: s.to,
    amount_units: s.amount.toString(),
  }));
  return {
    order_ref: ref,
    payment_ref: purchasePaymentRef(row.id),
    merchant_id: row.merchantId ? Buffer.from(row.merchantId).toString("hex") : null,
    status: ORDER_STATUSES[row.status] ?? "pending",
    product_code: code,
    amount_units: row.amount.toString(),
    shares,
    payer: row.payer,
    amped_user_id: row.buyerUserId !== null ? String(row.buyerUserId) : null,
    rns_name: row.rnsName,
    chain_id: row.chainId,
    token: usdcAddress(),
    tx_hash: row.txHash,
    block_number: row.blockNumber !== null ? Number(row.blockNumber) : null,
    fulfillment_state: (row.fulfillmentState as FulfillmentState | null) ?? "paid",
    created_at: row.createdAt.toISOString(),
    paid_at: row.softConfirmedAt?.toISOString() ?? null,
    finalized_at: row.confirmedAt?.toISOString() ?? null,
    refunded_at: row.refundedAt?.toISOString() ?? null,
    valid_until: row.accessUntil?.toISOString() ?? null,
  };
}

export type OrderObject = ReturnType<typeof orderObject>;

function refToId(ref: string): Buffer {
  if (!/^[0-9a-f]{32}$/.test(ref)) throw new OrderError(404, "not_found", "Unknown order.");
  return Buffer.from(ref, "hex");
}

async function ownOrder(merchantId: Buffer, ref: string): Promise<OrderRow> {
  const row = await prisma.purchase.findUnique({
    where: { id: refToId(ref) },
    select: ORDER_SELECT,
  });
  // Another merchant's order reads as unknown
  if (!row || !row.merchantId || !Buffer.from(row.merchantId).equals(merchantId)) {
    throw new OrderError(404, "not_found", "Unknown order.");
  }
  return row;
}

export async function getOrder(merchantId: Buffer, ref: string): Promise<OrderObject> {
  const row = await ownOrder(merchantId, ref);
  const codes = await productCodes([row]);
  return orderObject(
    row,
    row.offerId ? (codes.get(Buffer.from(row.offerId).toString("hex")) ?? null) : null
  );
}

/** One order for a webhook payload. Null when the purchase is not a merchant order. */
export async function orderForEvent(
  purchaseId: Uint8Array
): Promise<{ merchantId: Buffer; order: OrderObject } | null> {
  const row = await prisma.purchase.findUnique({
    where: { id: Buffer.from(purchaseId) },
    select: ORDER_SELECT,
  });
  if (!row?.merchantId) return null;
  const codes = await productCodes([row]);
  return {
    merchantId: Buffer.from(row.merchantId),
    order: orderObject(
      row,
      row.offerId ? (codes.get(Buffer.from(row.offerId).toString("hex")) ?? null) : null
    ),
  };
}

const VISIBLE = ["confirmed_soft", "confirmed", "refunded"];

export async function listOrders(
  merchantId: Buffer,
  filter: {
    status?: string;
    wallet?: string;
    rnsName?: string;
    productCode?: string;
    createdFrom?: Date;
    createdTo?: Date;
    cursor?: string;
    limit?: number;
  }
) {
  const statusMap: Record<string, string[]> = {
    paid: ["confirmed_soft"],
    finalized: ["confirmed"],
    refunded: ["refunded"],
  };
  let offerIds: Buffer[] | undefined;
  if (filter.productCode) {
    const offers = await prisma.offer.findMany({
      where: { merchantId, externalCode: filter.productCode.toUpperCase() },
      select: { id: true },
    });
    offerIds = offers.map(o => Buffer.from(o.id));
  }
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 100);
  const cursorDate = filter.cursor ? new Date(filter.cursor) : null;
  if (cursorDate && Number.isNaN(cursorDate.getTime())) {
    throw new OrderError(422, "invalid_cursor", "Send the next_cursor from the previous page.");
  }
  const rows = await prisma.purchase.findMany({
    where: {
      merchantId,
      status: { in: filter.status ? (statusMap[filter.status] ?? []) : VISIBLE },
      ...(filter.wallet && isAddress(filter.wallet, { strict: false })
        ? { payer: getAddress(filter.wallet) }
        : {}),
      ...(filter.rnsName ? { rnsName: filter.rnsName.toLowerCase() } : {}),
      ...(offerIds ? { offerId: { in: offerIds } } : {}),
      createdAt: {
        ...(filter.createdFrom ? { gte: filter.createdFrom } : {}),
        ...(filter.createdTo ? { lte: filter.createdTo } : {}),
        // The cursor is the created_at of the last order on the previous page
        ...(cursorDate ? { lt: cursorDate } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: ORDER_SELECT,
  });
  const page = rows.slice(0, limit);
  const codes = await productCodes(page);
  return {
    data: page.map(r =>
      orderObject(r, r.offerId ? (codes.get(Buffer.from(r.offerId).toString("hex")) ?? null) : null)
    ),
    next_cursor: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

/** Paid orders for a wallet with no completed check (partner spec 9.1). */
export async function entitlements(merchantId: Buffer, wallet: string, now = new Date()) {
  if (!isAddress(wallet, { strict: false }))
    throw new OrderError(422, "invalid_wallet", "Send a valid wallet address.");
  const rows = await prisma.purchase.findMany({
    where: {
      merchantId,
      payer: getAddress(wallet as Address),
      status: { in: ["confirmed_soft", "confirmed"] },
      fulfillmentState: { not: "verified" },
      OR: [{ accessUntil: null }, { accessUntil: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: ORDER_SELECT,
  });
  const codes = await productCodes(rows);
  return {
    data: rows.map(r =>
      orderObject(r, r.offerId ? (codes.get(Buffer.from(r.offerId).toString("hex")) ?? null) : null)
    ),
  };
}

const ORDER = FULFILLMENT_STATES;
/** Attempts per order (Authbase position 1). */
export const ATTEMPTS_PER_ORDER = 3;

/**
 * A progress report (partner spec 9.4). It updates the order, the Console and the Identity tab
 * status line. It never sets the Verified badge: that comes only from the Authbase status API.
 * A verified report must name the tier the order bought.
 */
export async function reportFulfillment(
  merchantId: Buffer,
  ref: string,
  body: {
    state: string;
    tier?: string;
    valid_until?: string;
    reason?: string;
    attempts_used?: number;
  },
  now = new Date()
) {
  const row = await ownOrder(merchantId, ref);
  if (!(row.status === "confirmed_soft" || row.status === "confirmed")) {
    throw new OrderError(409, "not_paid", "Only a paid order takes progress reports.");
  }
  const state = body.state as FulfillmentState;
  if (!ORDER.includes(state) || state === "paid") {
    throw new OrderError(
      422,
      "invalid_state",
      "state is started, in_review, verified or not_passed."
    );
  }
  if (
    body.attempts_used !== undefined &&
    (!Number.isInteger(body.attempts_used) ||
      body.attempts_used < 0 ||
      body.attempts_used > ATTEMPTS_PER_ORDER)
  ) {
    throw new OrderError(422, "invalid_attempts", `attempts_used is 0 to ${ATTEMPTS_PER_ORDER}.`);
  }
  const current = (row.fulfillmentState as FulfillmentState | null) ?? "paid";
  if (current === "verified")
    throw new OrderError(409, "already_verified", "This order is already verified.");
  const codes = await productCodes([row]);
  const code = row.offerId ? (codes.get(Buffer.from(row.offerId).toString("hex")) ?? null) : null;
  if (state === "verified") {
    if (!body.tier || body.tier.toUpperCase() !== code) {
      throw new OrderError(
        422,
        "wrong_tier",
        "A verified report names the tier this order bought."
      );
    }
  }
  if (state === "not_passed" && !body.reason?.trim()) {
    throw new OrderError(
      422,
      "reason_required",
      "A not_passed report gives a reason for the user."
    );
  }
  // A verified order, or one with no attempts left, closes: the fan can buy again later
  const closes =
    state === "verified" ||
    (state === "not_passed" && (body.attempts_used ?? 0) >= ATTEMPTS_PER_ORDER);
  await prisma.purchase.update({
    where: { id: row.id },
    data: { fulfillmentState: state, ...(closes ? { accessUntil: now } : {}) },
  });
  return getOrder(merchantId, ref);
}
