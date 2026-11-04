/**
 * Checkout intents (Build Board #49 Mobile checkout, PR CK-1; mobile first review R1).
 * One server side intent carries a purchase across sign up, the Wallet Buy USDC
 * handoff, a browser switch and an app reload.
 */
import { z } from "zod";

export const CHECKOUT_KINDS = ["purchase", "membership", "tip", "ticket"] as const;
export type CheckoutKind = (typeof CHECKOUT_KINDS)[number];

/** Kinds that can start an intent today. The rest arrive with memberships, tips and tickets. */
export const LIVE_CHECKOUT_KINDS = ["purchase"] as const;

export const CHECKOUT_STATUSES = [
  "open",
  "awaiting_funds",
  "signing",
  "submitted",
  "paid",
  "expired",
] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

/** Statuses the resume bar offers to finish. */
export const RESUMABLE_CHECKOUT_STATUSES = ["open", "awaiting_funds"] as const;

/** What an intent is for: a content item (until every sale is an offer) or a store product (C9). */
export const CHECKOUT_TARGET_TYPES = ["content", "offer"] as const;
export type CheckoutTargetType = (typeof CHECKOUT_TARGET_TYPES)[number];

/** Where the fan tapped Buy or Join, for the phone funnel (review section 7). */
export const CHECKOUT_SOURCES = [
  "bio",
  "item_page",
  "store",
  "library",
  "telegram",
  "email",
  "push",
  "other",
] as const;
export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

/** An intent lives 24 hours (review R1). */
export const CHECKOUT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** The query parameter every later step carries: sign up, Buy USDC, the handoff, reminders. */
export const CHECKOUT_INTENT_PARAM = "ci";

/** Intent ids are UUID v7, 32 lowercase hex characters. */
export const checkoutIntentIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** Promoter codes from ?via= (content spec 3.9). */
export const checkoutViaSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,32}$/);

export const checkoutStartInputSchema = z.object({
  kind: z.enum(CHECKOUT_KINDS),
  target: z.object({
    type: z.enum(CHECKOUT_TARGET_TYPES),
    id: z.string().min(1).max(64),
  }),
  via: checkoutViaSchema.optional(),
  source: z.enum(CHECKOUT_SOURCES).default("other"),
});
export type CheckoutStartInput = z.infer<typeof checkoutStartInputSchema>;

/** The path on the app host where an intent is paid (CK-2 builds the page). */
export function checkoutPayPath(intentId: string): string {
  return `/pay/${intentId}`;
}

/** Resume bar copy. Names the item only to its own signed in fan. */
export function checkoutResumeLabel(title: string): string {
  return `Finish buying ${title}`;
}

// ---------------------------------------------------------------- CK-2: the pay sheet

/**
 * What the pay sheet can do with an intent right now (docs/features/mobile-checkout.md
 * 5 and 10). Anything but ready shows its error state and keeps the intent open.
 */
export const CHECKOUT_QUOTE_STATES = ["ready", "paused", "limit", "seller", "removed"] as const;
export type CheckoutQuoteState = (typeof CHECKOUT_QUOTE_STATES)[number];

/**
 * The payment provider behind the sheet. CK-2 ships the mock; CK-5 swaps in AmpedPay
 * (PAY-2) and changes no screen.
 */
export const CHECKOUT_PROVIDERS = ["mock", "ampedpay"] as const;
export type CheckoutProvider = (typeof CHECKOUT_PROVIDERS)[number];

/**
 * Outcomes the mock provider can be told to return for QA, through ?mock= on a non
 * production build. Each one reaches a board state: c1 ready, short and paid; c7 and c8.
 */
export const CHECKOUT_MOCK_OUTCOMES = [
  "paid",
  "short",
  "failed",
  "price",
  "paused",
  "limit",
  "seller",
  "removed",
] as const;
export type CheckoutMockOutcome = (typeof CHECKOUT_MOCK_OUTCOMES)[number];

/** Mock price when no offer exists yet (offers arrive with store PR 9): 3 USDC. */
export const CHECKOUT_MOCK_PRICE_UNITS = 3_000_000n;

/**
 * site_settings key that overrides the mock price on staging, in USDC units (6 decimals),
 * for example "1500000" for 1.50 USDC. No row means CHECKOUT_MOCK_PRICE_UNITS.
 */
export const CHECKOUT_MOCK_PRICE_SETTING = "checkout_mock_price_units";

const UNITS_PER_USDC = 1_000_000n;

/**
 * Decision D6: creator money surfaces show "$3 USDC", never "$3" alone. Whole amounts drop
 * the cents ("$12"), others keep two places ("$12.50"). Sub cent remainders round up, so a
 * shortfall is never shown smaller than it is. Wallet keeps formatUsdcUnits.
 */
export function usdcDollars(units: string | bigint): string {
  const value = typeof units === "bigint" ? units : BigInt(units);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  let whole = abs / UNITS_PER_USDC;
  let cents = ((abs % UNITS_PER_USDC) + 9_999n) / 10_000n;
  if (cents === 100n) {
    whole += 1n;
    cents = 0n;
  }
  const text =
    cents === 0n
      ? `$${whole.toLocaleString("en-US")}`
      : `$${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** "$3 USDC" */
export function usdcDollarsLabel(units: string | bigint): string {
  return `${usdcDollars(units)} USDC`;
}

/** Pay sheet copy (mobile checkout 5, 8, 9 and 10). Boards c1, c5, c7, c8. No dashes. */
export const CHECKOUT_COPY = {
  paying: (handle: string) => `Paying @${handle}`,
  /**
   * Seller line, counsel text verbatim (docs/legal/creator-storefront-policy.md A.2,
   * COUNSEL-ADULT v1.1). The creator is the seller of record. Counsel's sentences only:
   * no refund sentence and no "Payments are final". Shown on every pay and join sheet.
   */
  soldBy: (seller: string) =>
    `Sold by ${seller} on Amped.bio. Your purchase is from ${seller}, not from Amped.`,
  explainer: "USDC is a digital dollar. 1 USDC equals 1 US dollar.",
  staging: "Test USDC on Base Sepolia. It has no value.",
  mock: "Test checkout. No USDC moves.",
  feeIncluded: "Includes the Amped.Bio fee",
  short: (amount: string) => `You need ${amount} USDC more.`,
  addUsdc: "Add USDC in Wallet",
  backToCheckout: "Back to checkout",
  coinbaseMinimum: (min: string) =>
    `Coinbase's smallest purchase is ${min}. The rest stays in your wallet.`,
  onTheWay: "Your USDC is on its way. Go back to Amped.Bio to finish.",
  checking: "Checking your payment. It can only go through once.",
  paid: (handle: string, amount: string) => `You paid @${handle} ${amount} USDC.`,
  priceChanged: (was: string, now: string) =>
    `The price changed. Was ${was} USDC. Now ${now} USDC.`,
  paused: "Payments are paused for a moment. Nothing was taken from your wallet.",
  limit: "You reached today's limit for purchases. Try again tomorrow.",
  seller: (handle: string) =>
    `@${handle} cannot take payments right now. Nothing was taken from your wallet.`,
  removed: "This item is no longer for sale. Nothing was taken from your wallet.",
  failed: "The payment did not go through. Nothing was taken from your wallet.",
  ended: "This checkout has ended. Start again from the page.",
} as const;

/** The intent a return path points at, or null for any other path. */
export function checkoutIntentFromPath(path: string | null | undefined): string | null {
  const match = path ? /^\/pay\/([0-9a-f]{32})$/.exec(path) : null;
  return match ? match[1]! : null;
}

/**
 * The Buy USDC prefill for a short balance (mobile checkout 8): the shortfall in whole
 * cents, rounded up, or Coinbase's minimum when the shortfall is smaller.
 */
export function checkoutFundingCents(
  shortUnits: bigint,
  minCents: number
): { cents: number; raisedToMinimum: boolean } {
  const need = Number((shortUnits + 9_999n) / 10_000n);
  return need < minCents
    ? { cents: minCents, raisedToMinimum: true }
    : { cents: need, raisedToMinimum: false };
}

// ---------------------------------------------------------------- PAY-2: AmpedPay purchases

/**
 * A Purchase through AmpedPay (docs/features/ampedpay.md, mobile checkout D4). Access opens at
 * confirmed_soft (the relayer's receipt) and is final at confirmed (final_confirmations). A
 * reorg moves confirmed_soft back to submitted and access closes again.
 */
export const PURCHASE_STATUSES = [
  "prepared",
  "submitting",
  "submitted",
  "confirmed_soft",
  "confirmed",
  "refunded",
  "failed",
  "expired",
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Statuses that pass the paid check. */
export const PURCHASE_ACCESS_STATUSES = ["confirmed_soft", "confirmed"] as const;

/** Statuses that count against the daily purchase limits. */
export const PURCHASE_COUNTED_STATUSES = [
  "submitting",
  "submitted",
  "confirmed_soft",
  "confirmed",
] as const;

/** Why prepare or submit refused. Each one maps to a pay sheet state (CK-5). */
export const PURCHASE_REFUSALS = [
  "paused",
  "seller",
  "limit",
  "removed",
  "owned",
  "in_progress",
  "price",
  "no_wallet",
  "wallet_mismatch",
  "insufficient_balance",
  "screening",
] as const;
export type PurchaseRefusal = (typeof PURCHASE_REFUSALS)[number];

/** Purchase ids are UUID v7, 32 lowercase hex characters. */
export const purchaseIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

export const purchasePrepareInputSchema = z.object({
  intentId: checkoutIntentIdSchema,
  /** The amount the sheet showed, in USDC units. A different price refuses with `price`. */
  amount: z.string().regex(/^\d{1,15}$/),
  /** The wallet the browser will sign with; refused when it is not the account's wallet. */
  signer: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
});
export type PurchasePrepareInput = z.infer<typeof purchasePrepareInputSchema>;

export const purchaseSubmitInputSchema = z.object({
  purchaseId: purchaseIdSchema,
  signature: z.string().regex(/^0x[0-9a-fA-F]{128,130}$/),
});
export type PurchaseSubmitInput = z.infer<typeof purchaseSubmitInputSchema>;
