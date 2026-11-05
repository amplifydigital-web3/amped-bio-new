import { prisma } from "@repo/database";
import { paymentChain } from "../../usdc/chain";
import type { PaidOffer, PaymentVerifier, PurchaseState } from "../types";

/** In flight: the fan signed and the relayer is sending or has sent. Not on chain yet. */
const PENDING_STATUSES = ["submitting", "submitted"] as const;

/**
 * USDC purchases through AmpedPay (PAY-2), for the `paid` kind (gating spec 3.3, G4).
 * Reads the Purchase rows the checkout and payments worker keep. Read only: it never
 * writes, and it never reads a stake (Rob, 24 Oct).
 *
 * A purchase gives access while it is confirmed_soft or confirmed and, for a product
 * with an access period, until its accessUntil. Refunded, failed and expired rows
 * never give access. Only rows on the chain that sells here count: a payment made on
 * another chain (the testnet before a move to Base mainnet) is not a payment here.
 */
export const usdcPaymentVerifier: PaymentVerifier = {
  async offer(offerIdHex: string): Promise<PaidOffer | null> {
    if (!/^[0-9a-f]{32}$/.test(offerIdHex)) return null;
    const row = await prisma.offer.findUnique({
      where: { id: Buffer.from(offerIdHex, "hex") },
      select: { creatorUserId: true, status: true, amountUnits: true },
    });
    if (!row) return null;
    return { ownerUserId: row.creatorUserId, status: row.status, amountUnits: row.amountUnits };
  },

  async verifyPurchase(
    userId: number,
    offerIdHex: string,
    now: Date = new Date()
  ): Promise<PurchaseState> {
    if (!/^[0-9a-f]{32}$/.test(offerIdHex)) return "none";
    const rows = await prisma.purchase.findMany({
      where: {
        buyerUserId: userId,
        // Same rule as a refund (store sales): a payment on another chain holds no
        // AmpedPay money here, so it must not open the item either
        chainId: paymentChain.id,
        targetType: "offer",
        targetId: offerIdHex,
        status: { in: ["confirmed", "confirmed_soft", ...PENDING_STATUSES] },
      },
      select: { status: true, accessUntil: true },
    });
    const open = (row: { accessUntil: Date | null }) =>
      row.accessUntil === null || row.accessUntil > now;
    if (rows.some(row => row.status === "confirmed" && open(row))) return "purchased";
    if (rows.some(row => row.status === "confirmed_soft" && open(row))) return "confirming";
    if (rows.some(row => (PENDING_STATUSES as readonly string[]).includes(row.status))) {
      return "pending";
    }
    return "none";
  },
};
