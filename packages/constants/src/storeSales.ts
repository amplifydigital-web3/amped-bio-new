/**
 * Store Sales and refunds (content PR C10, Screen Review row 161, boards st5 and k2;
 * docs/fixes/store-sales.md). Shared by the server, the Store tab and the tests.
 * Amounts are USDC units as strings. No buyer email or wallet ever leaves the server.
 * Copy: no dashes, $N USDC (decision D6), every 30 days for plans.
 */
import { z } from "zod";
import { purchaseIdSchema } from "./checkout";

export const SALES_PAGE_SIZE = 50;
/** Months the CSV picker offers, newest first, the current month included. */
export const SALES_CSV_MONTHS = 12;
/** The refund approval lives this long; the creator signs once and the relayer sends at once. */
export const REFUND_DEADLINE_SECONDS = 10 * 60;
export const REFUNDS_PER_HOUR = 20;

/** A sale's state as the creator sees it (board k2a, D4: Pending until final, then Final). */
export const SALE_STATES = ["pending", "final", "refunding", "refunded"] as const;
export type SaleState = (typeof SALE_STATES)[number];

/** "2026-11" */
export const salesMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const storeSalesListSchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
  })
  .optional();
export const storeSalesCsvSchema = z.object({ month: salesMonthSchema });
export const storeRefundPrepareSchema = z.object({ purchaseId: purchaseIdSchema });
export const storeRefundSubmitSchema = z.object({
  purchaseId: purchaseIdSchema,
  deadline: z.string().regex(/^\d{1,12}$/),
  refundSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  permitDeadline: z.string().regex(/^\d{1,12}$/),
  permitSignature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

/** Store report reasons (store policy 3.4, SP-Q48; adult content review 7.1). */
export const STORE_REPORT_REASONS = ["store_policy", "scam", "other"] as const;
export type StoreReportReason = (typeof STORE_REPORT_REASONS)[number];
export const STORE_REPORT_LABELS: Record<StoreReportReason, string> = {
  store_policy: "Store policy breaks the rules",
  scam: "It is a scam or misleading",
  other: "Something else",
};
export const storeReportSchema = z.object({
  handle: z.string().trim().min(1).max(64),
  reason: z.enum(STORE_REPORT_REASONS),
  details: z.string().trim().max(2000).optional(),
});

export interface SaleRow {
  /** The Purchase id */
  id: string;
  buyer: { name: string | null; handle: string | null } | null;
  /** Product title, or the item title for a single item sale */
  title: string;
  kind: "product" | "item";
  amount: string;
  /** Amped.Bio's share */
  fee: string;
  /** The promoter share (C12); null when there was none */
  promoter: string | null;
  /** What reached the creator: amount less the fee and any promoter or partner shares */
  net: string;
  state: SaleState;
  /** ISO time the payment was first seen on chain */
  paidAt: string;
  refundedAt: string | null;
  txHash: string | null;
  /** True while the refund window is open and the sale can be refunded */
  refundable: boolean;
}

export interface SalesTotals {
  /** This calendar month (UTC), what reached the creator, refunds left out */
  netThisMonth: string;
  salesThisMonth: number;
}

export interface SalesPage {
  totals: SalesTotals;
  rows: SaleRow[];
  nextCursor: string | null;
  /** The refund window in days, from Admin, Payments */
  refundWindowDays: number;
}

export type RefundRefusal =
  | "not_found"
  | "not_refundable"
  | "window_closed"
  | "already_refunded"
  | "paused"
  | "wallet_changed"
  | "insufficient_balance"
  | "signature"
  | "relayer";

export interface RefundTypedData {
  refund: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    message: { paymentRef: `0x${string}`; deadline: string };
  };
  permit: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    message: {
      owner: `0x${string}`;
      spender: `0x${string}`;
      value: string;
      nonce: string;
      deadline: string;
    };
  };
}

export interface RefundQuote {
  purchaseId: string;
  buyerName: string;
  title: string;
  /** What the buyer gets back: the full amount */
  amount: string;
  /** From the creator's wallet: everything but Amped.Bio's share */
  fromWallet: string;
  /** Amped.Bio returns its share from the treasury */
  ampedReturns: string;
  /** Part of fromWallet: promoter and partner shares that are not pulled back */
  notPulledBack: string;
  balanceAfter: string;
  /** REFUND_SUMMARY for the creator's live store policy; null when none is published */
  policySummary: string | null;
  signer: `0x${string}`;
  typed: RefundTypedData;
}

export type RefundPrepareResult =
  | { refused: false; quote: RefundQuote }
  | { refused: true; reason: RefundRefusal; shortBy?: string };

export type RefundSubmitResult =
  | { refused: false; state: SaleState; txHash: string | null }
  | { refused: true; reason: RefundRefusal };

/** Sales and refund copy (boards st5, k2, st5c). */
export const STORE_SALES_COPY = {
  title: "Sales",
  netThisMonth: "This month, after fees",
  salesThisMonth: "Sales",
  exportCsv: "Export CSV",
  exportMonth: "Month",
  exportNote: "CSV includes the store policy version for each sale.",
  exportEmpty: "No sales that month.",
  walletActivity: "See payouts in Wallet, Activity",
  states: {
    pending: "Pending",
    final: "Final",
    refunding: "Refunding",
    refunded: "Refunded",
  } satisfies Record<SaleState, string>,
  columns: {
    buyer: "Buyer",
    product: "Product",
    amount: "Amount",
    fee: "Fee",
    promoter: "Promoter",
    net: "Net",
    date: "Date",
    status: "Status",
  },
  rowMenu: (name: string) => `More for the sale to ${name}`,
  refund: "Refund",
  viewTx: "View transaction",
  someone: "A former member",
  emptyTitle: "No sales yet",
  empty: "When a fan buys from your store, the sale shows here.",
  errorTitle: "Sales did not load",
  errorCause: "Check your connection and try again.",
  showMore: "Show more",
  loading: "Loading",
  sheet: {
    title: (name: string) => `Refund ${name}?`,
    lead: (title: string, amount: string) =>
      `${title}. They get the full ${amount} back and access ends.`,
    policy: "Your store policy:",
    noPolicy: "You have no published store policy.",
    fromWallet: "From your wallet",
    ampedReturns: "Amped.Bio returns its share",
    buyerGets: (name: string) => `${name} receives`,
    balanceAfter: "Your balance after",
    notPulledBack: (amount: string) =>
      `The promoter share of ${amount} is not pulled back. It comes from your wallet as part of the refund.`,
    commit: (amount: string) => `Refund ${amount}`,
    keep: "Keep the sale",
    signing: "Confirm in your wallet",
    sending: "Sending the refund",
    done: "Refund sent. Access ends when it confirms.",
  },
  refusals: {
    not_found: "This sale was not found.",
    not_refundable: "This sale can not be refunded.",
    window_closed: (days: number) => `Refunds close ${days} days after a sale.`,
    already_refunded: "This sale is already refunded.",
    paused: "Refunds are paused right now. Try again later.",
    wallet_changed: "The wallet that received this sale is no longer your wallet.",
    insufficient_balance: (shortBy: string) => `Your wallet needs ${shortBy} more to refund.`,
    signature: "The approval did not match. Try again.",
    relayer: "The refund could not be sent. Nothing left your wallet. Try again.",
    rejected: "You cancelled in your wallet. Nothing was sent.",
  },
  report: {
    link: "Report store",
    title: "Report this store",
    reason: "What is wrong?",
    details: "Anything else we should know (optional)",
    submit: "Send report",
    sent: "Thanks. Our team reviews every report.",
    failed: "The report did not send. Try again.",
  },
} as const;

/** The month key ("2026-11") of a date, in UTC. */
export function salesMonthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last `count` months, newest first. */
export function recentSalesMonths(now: Date, count = SALES_CSV_MONTHS): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(salesMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

/** "November 2026" */
export function salesMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** One CSV field, quoted when it needs to be. Leading =, +, - and @ are neutralized. */
export function csvField(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
