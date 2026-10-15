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
