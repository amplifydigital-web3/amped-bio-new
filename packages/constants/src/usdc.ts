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
  | "invalid_recipient"
  | "wallet_mismatch";

/**
 * Why a prepared send ended in the browser before it reached the relayer.
 * The client reports one of these so the row leaves `screened` and the Admin
 * Money table shows the cause. Stored as `client_<code>` in failureCode.
 */
export const USDC_CLIENT_FAILURES = [
  // The live wallet is not the wallet linked to this account (account switch)
  "wallet_mismatch",
  // The wallet account changed between prepare and sign
  "signer_changed",
  // The fan cancelled the signature
  "sign_rejected",
  // The wallet threw while signing
  "sign_failed",
  // The wallet could not move to the payment chain
  "chain_switch_failed",
  // No live wallet at sign time
  "wallet_disconnected",
] as const;

export type UsdcClientFailure = (typeof USDC_CLIENT_FAILURES)[number];

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
    wallet_mismatch:
      "Your wallet does not match this account. Sign out and sign back in to send. Nothing was sent.",
  } satisfies Record<UsdcSendRefusal, string>,
  /** Lines for a send that stopped in the browser. Nothing moved in every case. */
  clientFailure: {
    wallet_mismatch:
      "Your wallet does not match this account. Sign out and sign back in. Nothing moved.",
    signer_changed: "Your wallet account changed while sending. Start again. Nothing moved.",
    sign_rejected: "You cancelled in your wallet. Nothing moved.",
    sign_failed: "Your wallet did not sign the send. Nothing moved.",
    chain_switch_failed: "Your wallet could not switch to the payment network. Nothing moved.",
    wallet_disconnected: "Your wallet is not connected. Reconnect and try again. Nothing moved.",
  } satisfies Record<UsdcClientFailure, string>,
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
  /** Fallback maximum for one Apple Pay or Google Pay purchase when Coinbase gives none */
  guestMaxUsd: 500,
  /** Coinbase's userAuthToken (embedded order mode) is kept this long */
  userAuthTokenDays: 60,
} as const;

/** Fan facing Buy USDC lines (spec 3.9). Counsel confirms the wording. No dashes. */
export const ONRAMP_COPY = {
  byline: "Sold and delivered by Coinbase",
  /** Wallet, Fund row (w5) */
  fundRow: "Apple Pay, Google Pay, debit card or bank. Coinbase sells, Amped.Bio charges nothing.",
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
  /** Apple Pay and Google Pay through the Headless Onramp (o2, o3). US only. */
  walletPay: {
    appleTitle: "Apple Pay",
    googleTitle: "Google Pay",
    body: "Debit card in your phone's wallet. No Coinbase account needed. US only. Stays on this page.",
    loading: "Loading Coinbase secure checkout",
    buttonLine: "Only you can press this button. Coinbase renders it.",
    frameLine:
      "Coinbase runs these steps inside its own frame under its privacy policy. Amped.Bio sees only the order result.",
    waiting: "Coinbase is taking your payment. It usually takes under a minute.",
    notOffered: "Apple Pay and Google Pay through Coinbase are for US buyers.",
  },
  arrived: (amount: string) => `${amount} USDC is in your wallet.`,
} as const;

/**
 * Plain words for the error codes Coinbase's payment frame posts (o6). Anything
 * not listed shows ONRAMP_COPY.notCompleted with the code.
 */
export const ONRAMP_FRAME_ERRORS: Record<string, string> = {
  ERROR_CODE_GUEST_TRANSACTION_LIMIT:
    "This is over Coinbase's weekly limit for Apple Pay and Google Pay. Try a smaller amount or your Coinbase account.",
  ERROR_CODE_GUEST_TRANSACTION_COUNT:
    "Coinbase allows only a few Apple Pay and Google Pay purchases a week. Try your Coinbase account.",
  ERROR_CODE_GUEST_CARD_INSUFFICIENT_BALANCE: "Your card did not have enough funds.",
  ERROR_CODE_GUEST_CARD_SOFT_DECLINED: "Your card was declined. Try again or use another card.",
  ERROR_CODE_GUEST_CARD_HARD_DECLINED: "Your card was declined. Use another card.",
  ERROR_CODE_GUEST_CARD_RISK_DECLINED: "Coinbase declined this purchase.",
  ERROR_CODE_GUEST_CARD_PREPAID_DECLINED: "Coinbase does not take prepaid cards.",
  ERROR_CODE_GUEST_INVALID_CARD: "Coinbase could not use this card. Use another card.",
  ERROR_CODE_GUEST_REGION_MISMATCH:
    "Coinbase sells through Apple Pay and Google Pay in the US only.",
  ERROR_CODE_GUEST_APPLE_PAY_NOT_SUPPORTED: "Apple Pay is not available in this browser.",
  ERROR_CODE_GUEST_APPLE_PAY_NOT_SETUP: "Add a debit card to Apple Wallet, then try again.",
  ERROR_CODE_GUEST_GOOGLE_PAY_NOT_SUPPORTED: "Google Pay is not available in this browser.",
  ERROR_CODE_GUEST_PERMISSION_DENIED: "Coinbase could not sell to this account.",
};

/**
 * Coinbase legal links named in the agreement line (o2). Counsel and the Coinbase
 * account representative confirm these before VITE_USDC_ONRAMP turns on in production.
 */
export const COINBASE_TERMS = {
  guestCheckout: "https://www.coinbase.com/legal/guest-checkout/us",
  userAgreement: "https://www.coinbase.com/legal/user_agreement",
  privacy: "https://www.coinbase.com/legal/privacy",
} as const;
