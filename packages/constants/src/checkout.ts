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

/** What an intent is for. Offers and plans replace content targets with store PR 9. */
export const CHECKOUT_TARGET_TYPES = ["content"] as const;
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
 * 5 and 10). Paid is terminal and shows the paid screen. Anything else but ready shows its
 * error state and keeps the intent open.
 */
export const CHECKOUT_QUOTE_STATES = [
  "ready",
  "paid",
  "paused",
  "limit",
  "seller",
  "removed",
] as const;
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
   * Seller line (COUNSEL-ADULT v1.1, docs/features/store-policy.md 3.4, board sp6). The creator
   * is the seller of record. CK-5 swaps the last sentence for the store policy link.
   */
  soldBy: (seller: string) =>
    `Sold by ${seller} on Amped.bio. You buy from ${seller}, not Amped. Refunds are at ${seller}'s discretion.`,
  explainer: "USDC is a digital dollar. 1 USDC equals 1 US dollar.",
  staging: "Test USDC on Base Sepolia. It has no value.",
  mock: "Test checkout. No USDC moves.",
  feeIncluded: "Includes the Amped.Bio fee",
  short: (amount: string) => `You need ${amount} USDC more.`,
  addUsdc: "Add USDC in Wallet",
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
