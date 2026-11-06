/**
 * Store Sales and refunds (content PR C10, row 161, boards st5 and k2). The rules that
 * matter: a creator sees only their own sales, with buyers by name and handle; a refund
 * needs both signatures from the wallet the sale paid, inside the window, and is sent once;
 * the creator funds everything but Amped.Bio's share; a refund ends access and a final
 * product sale leaves its product's count; the CSV carries the store policy version.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { decodeFunctionData, type Address } from "viem";
import {
  AMPEDPAY_ABI,
  REFUND_TYPES,
  USDC_PERMIT_TYPES,
  ampedPayDomain,
  purchasePaymentRef,
} from "@repo/web3";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    purchase: { findMany: fn(), findUnique: fn(), updateMany: fn(), update: fn() },
    offer: { findMany: fn(), updateMany: fn() },
    contentItem: { findMany: fn() },
    user: { findMany: fn() },
    userWallet: { findUnique: fn() },
    storePolicyVersion: { findMany: fn() },
    contentReport: { create: fn() },
  };
});
const chain = vi.hoisted(() => ({ balance: 100_000_000n, nonce: 3n, relayer: vi.fn() }));
const CONTRACT = "0x00000000000000000000000000000000000a3d9a" as Address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../services/usdc/chain", () => ({
  paymentChain: { id: 84532 },
  getUsdcBalance: vi.fn(async () => chain.balance),
  usdcDomain: vi.fn(async () => ({ name: "USDC", version: "2", verifyingContract: USDC })),
  paymentClient: () => ({ readContract: vi.fn(async () => chain.nonce) }),
}));
vi.mock("../services/usdc/relayer", () => ({
  RelayerError: class RelayerError extends Error {
    code = "reverted";
  },
  getRelayer: () => ({ call: chain.relayer }),
}));
vi.mock("../services/payments/onchain", () => ({ ampedPayAddress: () => CONTRACT }));
vi.mock("../services/payments/ready", () => ({ paymentsReady: () => true }));
vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => ({ refundWindowDays: 30, paymentsPaused: false })),
}));
vi.mock("../services/store/policy", () => ({
  liveVersion: vi.fn(async () => ({
    id: Buffer.alloc(16, 9),
    version: 2,
    mode: "standard",
    settings: { sellerName: "Maya Lin", refund: { option: "A" } },
  })),
  versionSummary: () => ({
    sellerName: "Maya Lin",
    summary: "You buy from Maya Lin. Sales are final.",
    version: 2,
  }),
}));

import {
  listSales,
  markRefunded,
  prepareRefund,
  saleShares,
  saleState,
  salesCsv,
  submitRefund,
} from "../services/store/sales";
import { csvField } from "@repo/constants";

const MAYA = 3;
const creatorKey = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);
const other = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
);
const NOW = new Date("2026-11-04T18:00:00Z");

function sale(extra: Record<string, unknown> = {}) {
  return {
    id: Buffer.alloc(16, 1),
    buyerUserId: 7,
    creatorUserId: MAYA,
    creatorAddress: creatorKey.address,
    targetType: "offer",
    targetId: "01".repeat(16),
    offerId: Buffer.alloc(16, 2),
    amount: 18_000_000n,
    fee: 900_000n,
    split: {
      recipients: [
        { to: creatorKey.address, bps: 8500, role: 0 },
        { to: "0x000000000000000000000000000000000000beef", bps: 500, role: 1 },
        { to: "0x000000000000000000000000000000000000cafe", bps: 1000, role: 2 },
      ],
    },
    status: "confirmed",
    chainId: 84532,
    txHash: "0xabc",
    softConfirmedAt: new Date("2026-11-01T12:00:00Z"),
    confirmedAt: new Date("2026-11-01T12:05:00Z"),
    refundedAt: null,
    refundRequestedAt: null,
    createdAt: new Date("2026-11-01T11:59:00Z"),
    storePolicyVersionId: Buffer.alloc(16, 9),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.balance = 100_000_000n;
  chain.relayer.mockResolvedValue("0xfeed");
  db.offer.findMany.mockResolvedValue([
    { id: Buffer.alloc(16, 2), title: "Field Kit sample pack" },
  ]);
  db.contentItem.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([{ id: 7, name: "Jordan Ellis", handle: "jordan" }]);
  db.userWallet.findUnique.mockResolvedValue({ address: creatorKey.address });
  db.purchase.updateMany.mockResolvedValue({ count: 1 });
  db.storePolicyVersion.findMany.mockResolvedValue([{ id: Buffer.alloc(16, 9), version: 2 }]);
});

describe("Sales list (board k2a)", () => {
  it("lists only the caller's paid sales with buyers by name and handle", async () => {
    db.purchase.findMany.mockResolvedValueOnce([sale()]).mockResolvedValueOnce([sale()]);
    const page = await listSales(MAYA, undefined, NOW);
    const where = db.purchase.findMany.mock.calls[0][0].where;
    expect(where.creatorUserId).toBe(MAYA);
    // AB-2: a merchant's order (creatorUserId is its Owner account) is not the creator's sale
    expect(where.merchantId).toBeNull();
    expect(where.status.in).toEqual(["confirmed_soft", "confirmed", "refunded"]);
    const row = page.rows[0]!;
    expect(row).toMatchObject({
      buyer: { name: "Jordan Ellis", handle: "jordan" },
      title: "Field Kit sample pack",
      state: "final",
      fee: "900000",
      promoter: "1800000",
      net: "15300000",
      refundable: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(page.totals).toEqual({ netThisMonth: "15300000", salesThisMonth: 1 });
  });

  it("reads Pending until final, then Final, Refunding and Refunded (D4)", () => {
    expect(saleState({ status: "confirmed_soft", refundRequestedAt: null })).toBe("pending");
    expect(saleState({ status: "confirmed", refundRequestedAt: null })).toBe("final");
    expect(saleState({ status: "confirmed", refundRequestedAt: NOW })).toBe("refunding");
    expect(saleState({ status: "refunded", refundRequestedAt: NOW })).toBe("refunded");
  });

  it("closes refunds after the window", async () => {
    db.purchase.findMany
      .mockResolvedValueOnce([sale({ softConfirmedAt: new Date("2026-09-01T00:00:00Z") })])
      .mockResolvedValueOnce([]);
    const page = await listSales(MAYA, undefined, NOW);
    expect(page.rows[0]!.refundable).toBe(false);
  });

  it("leaves a sale paid on another chain unrefundable, since there is no payment here (C10)", async () => {
    db.purchase.findMany
      .mockResolvedValueOnce([sale({ chainId: 1 })])
      .mockResolvedValueOnce([sale({ chainId: 1 })]);
    const page = await listSales(MAYA, undefined, NOW);
    expect(page.rows[0]!.refundable).toBe(false);
  });

  it("splits shares like the contract: creator takes the remainder", () => {
    expect(saleShares(18_000_000n, 900_000n, sale().split)).toEqual({
      platform: 900_000n,
      promoter: 1_800_000n,
      partner: 0n,
      net: 15_300_000n,
    });
    expect(saleShares(5_000_000n, 250_000n, { recipients: [] }).promoter).toBeNull();
  });
});

describe("Sales CSV (ST-Q32)", () => {
  it("has the store policy version on every sale and neutralizes formulas", async () => {
    db.purchase.findMany.mockResolvedValueOnce([sale()]);
    db.user.findMany.mockResolvedValueOnce([{ id: 7, name: "=HYPERLINK(1)", handle: "jordan" }]);
    const csv = await salesCsv(MAYA, "2026-11");
    const [header, line] = csv.trim().split("\r\n");
    expect(header).toContain("Store policy version");
    expect(line).toContain("'=HYPERLINK(1)");
    expect(line!.endsWith(",2")).toBe(true);
    expect(line).toContain("18.000000");
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
  });
});

async function signRefund(quote: Awaited<ReturnType<typeof prepareRefund>>, signer = creatorKey) {
  if (quote.refused) throw new Error("refused");
  const t = quote.quote.typed;
  const refundSignature = await signer.signTypedData({
    domain: t.refund.domain,
    types: REFUND_TYPES,
    primaryType: "Refund",
    message: {
      paymentRef: t.refund.message.paymentRef,
      deadline: BigInt(t.refund.message.deadline),
    },
  });
  const permitSignature = await signer.signTypedData({
    domain: t.permit.domain,
    types: USDC_PERMIT_TYPES,
    primaryType: "Permit",
    message: {
      owner: t.permit.message.owner,
      spender: t.permit.message.spender,
      value: BigInt(t.permit.message.value),
      nonce: BigInt(t.permit.message.nonce),
      deadline: BigInt(t.permit.message.deadline),
    },
  });
  return {
    purchaseId: quote.quote.purchaseId,
    deadline: t.refund.message.deadline,
    refundSignature,
    permitDeadline: t.permit.message.deadline,
    permitSignature,
  };
}

describe("Refund (board k2b)", () => {
  const id = "01".repeat(16);

  it("quotes the full amount back, Amped.Bio's share from the treasury, the rest from the wallet", async () => {
    db.purchase.findUnique.mockResolvedValue(sale());
    const result = await prepareRefund(MAYA, id, NOW);
    expect(result.refused).toBe(false);
    if (result.refused) return;
    expect(result.quote).toMatchObject({
      buyerName: "Jordan Ellis",
      amount: "18000000",
      fromWallet: "17100000",
      ampedReturns: "900000",
      notPulledBack: "1800000",
      balanceAfter: "82900000",
      policySummary: "You buy from Maya Lin. Sales are final.",
    });
    expect(result.quote.typed.refund.domain).toEqual(ampedPayDomain(84532, CONTRACT));
    expect(result.quote.typed.permit.message).toMatchObject({
      owner: creatorKey.address,
      spender: CONTRACT,
      value: "17100000",
      nonce: "3",
    });
  });

  it("refuses another creator's sale, a closed window, a short wallet and a changed wallet", async () => {
    db.purchase.findUnique.mockResolvedValue(sale({ creatorUserId: 99 }));
    expect(await prepareRefund(MAYA, id, NOW)).toEqual({ refused: true, reason: "not_found" });

    db.purchase.findUnique.mockResolvedValue(
      sale({ softConfirmedAt: new Date("2026-09-01T00:00:00Z") })
    );
    expect(await prepareRefund(MAYA, id, NOW)).toEqual({ refused: true, reason: "window_closed" });

    db.purchase.findUnique.mockResolvedValue(sale());
    chain.balance = 17_000_000n;
    expect(await prepareRefund(MAYA, id, NOW)).toEqual({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "100000",
    });

    chain.balance = 100_000_000n;
    db.userWallet.findUnique.mockResolvedValue({ address: other.address });
    expect(await prepareRefund(MAYA, id, NOW)).toEqual({ refused: true, reason: "wallet_changed" });
  });

  it("refuses a sale paid on another chain: the refund would have no payment here (C10)", async () => {
    db.purchase.findUnique.mockResolvedValue(sale({ chainId: 1 }));
    expect(await prepareRefund(MAYA, id, NOW)).toEqual({ refused: true, reason: "not_refundable" });

    // Signatures prepared elsewhere must not reach the relayer either
    db.purchase.findUnique.mockResolvedValue(sale());
    const signed = await signRefund(await prepareRefund(MAYA, id, NOW));
    db.purchase.findUnique.mockResolvedValue(sale({ chainId: 1 }));
    expect(await submitRefund(MAYA, signed, NOW)).toEqual({
      refused: true,
      reason: "not_refundable",
    });
    expect(chain.relayer).not.toHaveBeenCalled();
  });

  it("sends a signed refund once, through the relayer, with both signatures", async () => {
    db.purchase.findUnique.mockResolvedValue(sale());
    const signed = await signRefund(await prepareRefund(MAYA, id, NOW));
    const result = await submitRefund(MAYA, signed, NOW);
    expect(result).toEqual({ refused: false, state: "refunding", txHash: "0xfeed" });
    const claim = db.purchase.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ refundRequestedAt: null });
    const [to, data, key] = chain.relayer.mock.calls[0];
    expect(to).toBe(CONTRACT);
    expect(key).toBe(`refund:${id}`);
    const call = decodeFunctionData({ abi: AMPEDPAY_ABI, data });
    expect(call.functionName).toBe("refund");
    expect(call.args?.[0]).toBe(purchasePaymentRef(Buffer.alloc(16, 1)));
    expect(db.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { refundTxHash: "0xfeed" } })
    );
  });

  it("refuses a signature from any other wallet and sends nothing", async () => {
    db.purchase.findUnique.mockResolvedValue(sale());
    const signed = await signRefund(await prepareRefund(MAYA, id, NOW), other);
    expect(await submitRefund(MAYA, signed, NOW)).toEqual({ refused: true, reason: "signature" });
    expect(chain.relayer).not.toHaveBeenCalled();
  });

  it("does not send twice when the row is already claimed", async () => {
    db.purchase.findUnique.mockResolvedValue(sale());
    const signed = await signRefund(await prepareRefund(MAYA, id, NOW));
    db.purchase.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await submitRefund(MAYA, signed, NOW)).toEqual({
      refused: false,
      state: "refunding",
      txHash: null,
    });
    expect(chain.relayer).not.toHaveBeenCalled();
  });

  it("releases the claim when the relayer fails", async () => {
    db.purchase.findUnique.mockResolvedValue(sale());
    const signed = await signRefund(await prepareRefund(MAYA, id, NOW));
    chain.relayer.mockRejectedValueOnce(new Error("down"));
    expect(await submitRefund(MAYA, signed, NOW)).toEqual({ refused: true, reason: "relayer" });
    expect(db.purchase.updateMany.mock.calls[1][0].data).toEqual({ refundRequestedAt: null });
  });
});

describe("Refunded log (payments worker)", () => {
  it("ends a final sale and takes it off the product's count", async () => {
    db.purchase.findUnique.mockResolvedValue({ offerId: Buffer.alloc(16, 2) });
    expect(await markRefunded(Buffer.alloc(16, 1), NOW)).toBe(true);
    expect(db.purchase.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: "confirmed" },
      data: { status: "refunded", refundedAt: NOW },
    });
    expect(db.offer.updateMany).toHaveBeenCalledWith({
      where: { id: Buffer.alloc(16, 2), salesCount: { gt: 0 } },
      data: { salesCount: { decrement: 1 } },
    });
  });

  it("ends a pending sale without touching the count", async () => {
    db.purchase.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    expect(await markRefunded(Buffer.alloc(16, 1), NOW)).toBe(true);
    expect(db.offer.updateMany).not.toHaveBeenCalled();
  });
});
