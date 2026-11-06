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

// ------------------------------------------------------------- AB-2: service offers

/** Where a merchant's service offer shows. rns_identity is the RNS Identity tab storefront. */
export const OFFER_PLACEMENTS = ["rns_identity"] as const;
export type OfferPlacement = (typeof OFFER_PLACEMENTS)[number];

/** A paid order is good for this many days before the check must start (Authbase position 1). */
export const SERVICE_ORDER_VALID_DAYS = 30;

/** Progress of a check the merchant runs after payment (spec 3.9, partner spec 9.4). */
export const FULFILLMENT_STATES = [
  "paid",
  "started",
  "in_review",
  "verified",
  "not_passed",
] as const;
export type FulfillmentState = (typeof FULFILLMENT_STATES)[number];

/** One card on the storefront (boards s1, s2, s4). */
export type StorefrontOffer = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  features: string[];
  tag: string | null;
  amountUnits: string;
  rank: number;
};

export type Storefront = {
  merchant: { id: string; name: string; storePolicyUrl: string | null; takingPayments: boolean };
  feeBps: number;
  offers: StorefrontOffer[];
  /** The viewer's latest order on this storefront, for the status line (board s3) */
  latestOrder: {
    purchaseId: string;
    offerId: string;
    code: string | null;
    status: string;
    fulfillmentState: FulfillmentState | null;
    paidAt: string | null;
  } | null;
} | null;

/** Identity tab storefront copy (boards s1 to s4, spec 3.4 and 3.12). No dashes. */
export const IDENTITY_STOREFRONT_COPY = {
  choose: "Choose a check",
  buyNow: "Buy now",
  yourCheck: "Your check",
  loading: "Loading checks",
  loadFailed: "We could not load the checks right now.",
  loadFailedSub: "Your status is safe. Try again in a minute.",
  notTaking: (merchant: string) => `${merchant} is not taking payments right now.`,
  notTakingSub: "Nothing was taken from your wallet. Try again later.",
  buyFailed: "Checkout did not open. Try again.",
  footer: (merchant: string, percent: string) =>
    `You pay in USDC from your wallet. ${merchant} runs the check. The price includes the Amped.Bio fee (${percent}).`,
  status: {
    checking: "Checking your payment. It can only go through once.",
    paid: (merchant: string) => `Paid. Verify your identity on ${merchant}.`,
    paidSub: "You sign in with your Amped.Bio account. It takes a few minutes. Have your ID ready.",
    inReview: (merchant: string) => `${merchant} is reviewing your check.`,
    creating: (merchant: string) => `${merchant} is creating your ID on chain.`,
    notPassed: (merchant: string) => `${merchant} could not verify you.`,
  },
} as const;
