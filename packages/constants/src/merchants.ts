/**
 * Business sellers on AmpedPay (Build Board #66, AB-1; docs/features/authbase-storefront.md
 * 3.2, 3.8, 3.10). Authbase is the first merchant.
 */

export const MERCHANT_STATUSES = ["pending", "active", "suspended"] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];

/** Console roles (spec 3.8). Owners and Finance need two factor. */
export const MERCHANT_ROLES = ["owner", "finance", "developer", "viewer"] as const;
export type MerchantRole = (typeof MERCHANT_ROLES)[number];

export const PAYOUT_WALLET_STATUSES = [
  "proposed",
  "approved",
  "effective",
  "replaced",
  "rejected",
  "cancelled",
] as const;
export type PayoutWalletStatus = (typeof PAYOUT_WALLET_STATUSES)[number];

/** A payout wallet takes effect this long after a second Owner approves it (M2). */
export const PAYOUT_WALLET_DELAY_MS = 24 * 60 * 60 * 1000;

/** Authbase's fee on launch (M3, Rob 5 Nov): 20%. Must sit inside MAX_MERCHANT_FEE_BPS. */
export const DEFAULT_MERCHANT_FEE_BPS = 2_000;

/** Reasons checkMerchant refuses a sale. Every one fails closed. */
export const MERCHANT_FAIL_REASONS = [
  "not_found",
  "not_active",
  "no_payout_wallet",
  "screening",
  "fee_out_of_range",
  "unavailable",
] as const;
export type MerchantFailReason = (typeof MERCHANT_FAIL_REASONS)[number];

/**
 * The message the payout wallet signs to prove control (M2). The proposer signs it in their
 * wallet (EOA) or the Safe signs it (ERC-1271). Binding the merchant id, the address and the
 * chain stops a proof being reused for another merchant or network.
 */
export function payoutWalletProofMessage(params: {
  merchantId: string;
  merchantName: string;
  address: string;
  chainId: number;
  nonce: string;
}): string {
  return [
    "Amped.Bio payout wallet",
    `Merchant: ${params.merchantName} (${params.merchantId})`,
    `Wallet: ${params.address.toLowerCase()}`,
    `Chain: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    "This wallet will receive this merchant's USDC sales on Amped.Bio.",
  ].join("\n");
}
