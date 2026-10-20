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
