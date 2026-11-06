import {
  getAddress,
  hashTypedData,
  isAddressEqual,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { AMPEDPAY_CONTRACT } from "@repo/constants";
import { SPLIT_ROLES, SPLIT_TABLE_TYPES, ampedPayDomain, type SplitRole } from "@repo/web3";
import { accountAddress, isAccountConfigured, paymentsCdp } from "./accounts";
import type { ContractLimits } from "./settings";

/**
 * The split table (PAY-2; docs/features/ampedpay.md 3.2, content spec 3.9 "The split").
 * The API builds one table per payment, checks every rule the contract enforces so a bad
 * table never costs the relayer gas, and has the split signer (a CDP account whose policy
 * allows EIP-712 signing only) sign it. The payer's authorization uses its hash as nonce.
 */

export const BPS = 10_000;

export type SplitRecipient = { to: Address; bps: number; role: SplitRole };

export type SplitTable = {
  paymentRef: Hex;
  payer: Address;
  amount: bigint;
  recipients: SplitRecipient[];
  validBefore: bigint;
};

/** What a stored Purchase keeps of its split: enough to rebuild the exact table. */
export type StoredSplit = {
  recipients: { to: string; bps: number; role: number }[];
  validBefore: string;
  signature: Hex;
};

export class SplitRuleError extends Error {
  constructor(readonly rule: string) {
    super(`Split table refused: ${rule}`);
    this.name = "SplitRuleError";
  }
}

/** The seller row of a split: the creator, or the merchant on a business seller's sale (M11). */
export type SellerRole = typeof SPLIT_ROLES.creator | typeof SPLIT_ROLES.merchant;

/**
 * Seller, platform and (Phase 4) promoter rows. Platform bps comes from the fee setting (or the
 * merchant's fee); the seller gets the remainder. Partner rows arrive with SplitRecipient (store
 * work). `creator` is the seller's payout address: the creator's wallet, or the merchant's
 * effective payout wallet when sellerRole is merchant (authbase-storefront 3.1).
 */
export function buildSplit(params: {
  paymentRef: Hex;
  payer: Address;
  amount: bigint;
  creator: Address;
  treasury: Address;
  platformFeeBps: number;
  promoter?: { to: Address; bps: number } | null;
  validBefore: bigint;
  sellerRole?: SellerRole;
}): SplitTable {
  const promoterBps = params.promoter?.bps ?? 0;
  const recipients: SplitRecipient[] = [
    {
      to: getAddress(params.creator),
      bps: BPS - params.platformFeeBps - promoterBps,
      role: params.sellerRole ?? SPLIT_ROLES.creator,
    },
    { to: getAddress(params.treasury), bps: params.platformFeeBps, role: SPLIT_ROLES.platform },
  ];
  if (params.promoter) {
    recipients.push({
      to: getAddress(params.promoter.to),
      bps: promoterBps,
      role: SPLIT_ROLES.promoter,
    });
  }
  return {
    paymentRef: params.paymentRef,
    payer: getAddress(params.payer),
    amount: params.amount,
    recipients,
    validBefore: params.validBefore,
  };
}

/**
 * Every rule AmpedPay.pay enforces (spec 3.2), against the live contract limits. Throws
 * SplitRuleError naming the first rule broken. nowSeconds is the time the relayer will send.
 */
export function assertSplitRules(
  split: SplitTable,
  limits: ContractLimits,
  treasury: Address,
  nowSeconds: bigint
): void {
  if (/^0x0*$/.test(split.paymentRef)) throw new SplitRuleError("zero_payment_ref");
  if (isAddressEqual(split.payer, zeroAddress)) throw new SplitRuleError("zero_payer");
  if (split.validBefore <= nowSeconds) throw new SplitRuleError("expired");
  if (split.validBefore - nowSeconds > BigInt(limits.maxSplitValidity))
    throw new SplitRuleError("validity_too_long");
  if (split.amount < limits.minPayment || split.amount > limits.maxPayment)
    throw new SplitRuleError("amount_out_of_range");

  const n = split.recipients.length;
  if (n < 2 || n > limits.maxRecipients) throw new SplitRuleError("recipient_count");
  let sum = 0;
  let creators = 0;
  let platforms = 0;
  let promoters = 0;
  let merchants = 0;
  let platformBps = 0;
  const seen = new Set<string>();
  for (const r of split.recipients) {
    const key = r.to.toLowerCase();
    if (isAddressEqual(r.to, zeroAddress) || r.bps <= 0 || r.role > SPLIT_ROLES.merchant)
      throw new SplitRuleError("invalid_recipient");
    if (seen.has(key)) throw new SplitRuleError("duplicate_recipient");
    seen.add(key);
    // The payer can't be paid by their own payment: no self purchase through a split row
    if (isAddressEqual(r.to, split.payer)) throw new SplitRuleError("payer_is_recipient");
    sum += r.bps;
    if (r.role === SPLIT_ROLES.creator) {
      creators += 1;
      if (r.bps < limits.minCreatorBps) throw new SplitRuleError("creator_bps");
    } else if (r.role === SPLIT_ROLES.merchant) {
      merchants += 1;
      if (r.bps < limits.minCreatorBps) throw new SplitRuleError("creator_bps");
    } else if (r.role === SPLIT_ROLES.platform) {
      platforms += 1;
      if (!isAddressEqual(r.to, treasury)) throw new SplitRuleError("platform_not_treasury");
      platformBps = r.bps;
    } else if (r.role === SPLIT_ROLES.promoter) {
      promoters += 1;
    }
  }
  // Same order as AmpedPay._validateRecipients (M11): one seller row, creator or merchant
  if (merchants > 1) throw new SplitRuleError("merchant_count");
  if (creators + merchants !== 1) throw new SplitRuleError("creator_count");
  if (platforms === 1) {
    const ceiling =
      merchants === 1 ? AMPEDPAY_CONTRACT.MAX_MERCHANT_FEE_BPS : AMPEDPAY_CONTRACT.MAX_FEE_BPS;
    if (platformBps < limits.feeFloorBps || platformBps > ceiling)
      throw new SplitRuleError("platform_bps");
  }
  if (platforms !== 1) throw new SplitRuleError("platform_count");
  if (promoters > 1) throw new SplitRuleError("promoter_count");
  if (sum !== BPS) throw new SplitRuleError("bps_sum");
}

function isSellerRole(role: number): boolean {
  return role === SPLIT_ROLES.creator || role === SPLIT_ROLES.merchant;
}

/** The share each recipient receives, as the contract pays it: the seller gets the rounding. */
export function splitShares(split: SplitTable): { to: Address; role: SplitRole; amount: bigint }[] {
  let paidOut = 0n;
  const out = split.recipients.map(r => {
    if (isSellerRole(r.role)) return { to: r.to, role: r.role, amount: 0n };
    const amount = (split.amount * BigInt(r.bps)) / BigInt(BPS);
    paidOut += amount;
    return { to: r.to, role: r.role, amount };
  });
  const creator = out.find(r => isSellerRole(r.role));
  if (creator) creator.amount = split.amount - paidOut;
  return out;
}

/** The platform share in USDC units. */
export function platformShare(split: SplitTable): bigint {
  return splitShares(split).find(r => r.role === SPLIT_ROLES.platform)?.amount ?? 0n;
}

function typedSplit(split: SplitTable) {
  return {
    paymentRef: split.paymentRef,
    payer: split.payer,
    amount: split.amount,
    recipients: split.recipients.map(r => ({ to: r.to, bps: r.bps, role: r.role })),
    validBefore: split.validBefore,
  };
}

/** The EIP-712 digest AmpedPay.hashSplit returns. */
export function hashSplit(split: SplitTable, chainId: number, contract: Address): Hex {
  return hashTypedData({
    domain: ampedPayDomain(chainId, contract),
    types: SPLIT_TABLE_TYPES,
    primaryType: "SplitTable",
    message: typedSplit(split),
  });
}

/** True when the signature over the split recovers to the expected signer. */
export async function isSplitSignedBy(
  split: SplitTable,
  chainId: number,
  contract: Address,
  signature: Hex,
  signer: Address
): Promise<boolean> {
  try {
    const recovered = await recoverTypedDataAddress({
      domain: ampedPayDomain(chainId, contract),
      types: SPLIT_TABLE_TYPES,
      primaryType: "SplitTable",
      message: typedSplit(split),
      signature,
    });
    return isAddressEqual(recovered, signer);
  } catch {
    return false;
  }
}

/** Signs split tables. CDP in every environment; tests replace it. */
export interface SplitSigner {
  address(): Promise<Address>;
  sign(split: SplitTable, chainId: number, contract: Address): Promise<Hex>;
}

const cdpSplitSigner: SplitSigner = {
  address: () => accountAddress("splitSigner"),
  async sign(split, chainId, contract) {
    const address = await accountAddress("splitSigner");
    // CDP wants integers as decimal strings
    const { signature } = await paymentsCdp().signEvmTypedData(address, {
      domain: ampedPayDomain(chainId, contract),
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        SplitTable: [...SPLIT_TABLE_TYPES.SplitTable],
        Recipient: [...SPLIT_TABLE_TYPES.Recipient],
      },
      primaryType: "SplitTable",
      message: {
        paymentRef: split.paymentRef,
        payer: split.payer,
        amount: split.amount.toString(),
        recipients: split.recipients.map(r => ({
          to: r.to,
          bps: String(r.bps),
          role: String(r.role),
        })),
        validBefore: split.validBefore.toString(),
      },
    });
    return signature;
  },
};

let signer: SplitSigner | null = null;

export function isSplitSignerConfigured(): boolean {
  return signer !== null || isAccountConfigured("splitSigner");
}

export function splitSigner(): SplitSigner {
  return signer ?? cdpSplitSigner;
}

/** Test seam. */
export function setSplitSignerForTests(next: SplitSigner | null) {
  signer = next;
}

export function storedSplit(split: SplitTable, signature: Hex): StoredSplit {
  return {
    recipients: split.recipients.map(r => ({ to: r.to, bps: r.bps, role: r.role })),
    validBefore: split.validBefore.toString(),
    signature,
  };
}

/** Rebuilds the exact table a Purchase stored, for submit. */
export function splitFromStored(
  stored: StoredSplit,
  params: { paymentRef: Hex; payer: Address; amount: bigint }
): SplitTable {
  return {
    paymentRef: params.paymentRef,
    payer: getAddress(params.payer),
    amount: params.amount,
    recipients: stored.recipients.map(r => ({
      to: getAddress(r.to),
      bps: r.bps,
      role: r.role as SplitRole,
    })),
    validBefore: BigInt(stored.validBefore),
  };
}
