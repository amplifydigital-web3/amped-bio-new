/**
 * USDC in the wallet (Build Board #29). Limits and fan facing lines shared by
 * the server and the client. Spec: docs/features/usdc-wallet-onramp.md 3.4,
 * 3.9 and decision 7.
 */

/** Gasless send limits per account per UTC day (decision 7). */
export const USDC_SEND_LIMITS = {
  dailyCount: 10,
  /** 2,000 USDC in base units (6 decimals) */
  dailyUnits: 2_000_000_000n,
  /** How long a signed authorization stays valid, seconds */
  authorizationTtlSeconds: 600,
} as const;

/** Why a send was refused before anything was submitted. */
export type UsdcSendRefusal =
  | "screening"
  | "limit"
  | "paused"
  | "email_unverified"
  | "no_wallet"
  | "insufficient_balance"
  | "invalid_recipient";

/** Fan facing lines (spec 3.9). Counsel confirms the wording. No dashes. */
export const USDC_COPY = {
  receiveNotice: "Send only USDC on Base to this address. Other networks and tokens are lost.",
  feeLine: "Network fee: paid by Amped.Bio.",
  refusal: {
    screening: "This address cannot receive USDC from Amped.Bio. Nothing was sent.",
    limit: "You have reached today's USDC send limit. Try again tomorrow.",
    paused: "USDC sends are paused for a moment. Your balance is safe. Try again shortly.",
    email_unverified: "Verify your email to send USDC.",
    no_wallet: "Connect your wallet to send USDC.",
    insufficient_balance: "More than your available USDC.",
    invalid_recipient: "Enter a wallet address or choose a person.",
  } satisfies Record<UsdcSendRefusal, string>,
} as const;

/*
 * Buy USDC through Coinbase (Build Board #5). Spec docs/features/usdc-wallet-onramp.md
 * 3.5, 3.7 and 3.9. Coinbase sells, quotes, verifies and delivers; Amped.Bio
 * shows the quote and reports arrival. Nothing is charged on Amped.Bio.
 */

/** How the fan pays Coinbase. Apple Pay and Google Pay run in the Headless Onramp (US). */
export type OnrampMode = "coinbase_account" | "apple_pay" | "google_pay";

/** OnrampSession.status. The chain decides arrival; a webhook never credits a balance. */
export type OnrampStatus =
  | "created"
  | "pending_verification"
  | "pending_payment"
  | "processing"
  | "success"
  | "failed"
  | "canceled"
  | "expired";

export const ONRAMP_FINAL_STATUSES: readonly OnrampStatus[] = [
  "success",
  "failed",
  "canceled",
  "expired",
];

export const ONRAMP_LIMITS = {
  /** Fallback minimum in USD when Coinbase's options do not give one */
  minUsd: 5,
  /** Fallback maximum in USD for one purchase */
  maxUsd: 5_000,
  /** Amount presets on the Amount step (o1) */
  presets: ["10", "25", "50", "100"],
  /** A Coinbase account session with no Coinbase transaction after this long is expired */
  sessionTtlMinutes: 120,
  /** The single use Coinbase link lives this long */
  hostedLinkMinutes: 5,
} as const;

/** Fan facing Buy USDC lines (spec 3.9). Counsel confirms the wording. No dashes. */
export const ONRAMP_COPY = {
  byline: "Sold and delivered by Coinbase",
  /** Wallet, Fund row (w5). USDC-5 adds Apple Pay and Google Pay. */
  fundRow: "Debit card, bank or your Coinbase balance. Coinbase sells, Amped.Bio charges nothing.",
  quoteLine: "Coinbase sets the price and fees. Nothing is charged on Amped.Bio.",
  agreement:
    "By continuing you agree to Coinbase's Guest Checkout Terms, User Agreement and Privacy Policy.",
  notCompleted: "Coinbase did not complete the purchase. Nothing was charged on Amped.Bio.",
  region:
    "Coinbase does not sell USDC in your region yet. You can deposit USDC from an exchange or another wallet.",
  paused: "Buy USDC is paused for a moment. Try again shortly.",
  slow: "This is taking longer than usual. Your USDC will show in Activity when it arrives.",
  coinbaseAccount: {
    title: "Pay with your Coinbase account",
    usBody: "Debit card or bank in the US. Opens Coinbase in a new tab.",
    intlBody: "Debit or credit card in most countries. Opens Coinbase in a new tab.",
    waiting:
      "Coinbase opened in a new tab. Pay there with your debit card, bank or balance. Come back here when it says done.",
    linkLine:
      "The Coinbase link works once and for five minutes. Open Coinbase again makes a new one.",
  },
  arrived: (amount: string) => `${amount} USDC is in your wallet.`,
} as const;

/**
 * Coinbase legal links named in the agreement line (o2). Counsel and the Coinbase
 * account representative confirm these before VITE_USDC_ONRAMP turns on in production.
 */
export const COINBASE_TERMS = {
  guestCheckout: "https://www.coinbase.com/legal/guest-checkout/us",
  userAgreement: "https://www.coinbase.com/legal/user_agreement",
  privacy: "https://www.coinbase.com/legal/privacy",
} as const;
