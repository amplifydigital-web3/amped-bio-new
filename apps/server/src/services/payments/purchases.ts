/**
 * AmpedPay purchases (PAY-2, Build Board #50; docs/features/ampedpay.md, content spec 3.9,
 * mobile checkout D4).
 *
 * prepare: checks the pause, the seller, the daily limits, the price the sheet showed, the
 * fan's wallet and balance, screens the payer and the creator, builds the split table and
 * has the split signer sign it. Stores a Purchase in `prepared` and returns the EIP-3009
 * ReceiveWithAuthorization the fan signs: to AmpedPay, for the total, nonce = split hash.
 * submit: re-checks, verifies the fan's signature, claims the row (a double tap submits
 * once) and has the relayer call AmpedPay.pay with the signed split.
 * settle: the receipt decides. At soft_unlock_confirmations the Purchase is confirmed_soft
 * and the item opens; at final_confirmations it is confirmed, the events are stored and the
 * receipt email goes out. A receipt that disappears (reorg) moves it back to submitted.
 *
 * Every value comes from paymentSettings() and the live contract read. Offers arrive with
 * store PR 9; until then the price is the checkout amount (services/checkout/quote.ts).
 */
import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddress,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { render } from "@react-email/render";
import { prisma } from "@repo/database";
import {
  PURCHASE_ACCESS_STATUSES,
  PURCHASE_COUNTED_STATUSES,
  usdcDollarsLabel,
  type PurchaseRefusal,
  type PurchaseStatus,
} from "@repo/constants";
import {
  AMPEDPAY_ABI,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  SPLIT_ROLES,
  purchaseIdFromPaymentRef,
  purchasePaymentRef,
} from "@repo/web3";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import PurchaseReceiptTemplate from "../../utils/email/PurchaseReceiptTemplate";
import { getUsdcBalance, paymentChain, paymentClient, usdcDomain } from "../usdc/chain";
import { RelayerError, getRelayer } from "../usdc/relayer";
import { ScreeningUnavailableError, screenAddress } from "../usdc/screen";
import { startOfUtcDay } from "../usdc/limits";
import {
  effectiveStatus,
  hexToIntentId,
  notFound,
  resolveTarget,
  targetOf,
} from "../checkout/intents";
import { checkoutAmount } from "../checkout/quote";
import { liveVersion } from "../store/policy";
import { countFinalSale } from "../store/sales";
import { resolvePromoter } from "../store/promoters";
import { checkIdentity } from "../identity/checks";
import { checkMerchant } from "../merchants/check";
import { ampedPayAddress, readContractState } from "./onchain";
import { paymentsReady } from "./ready";
import { limitsFromState, paymentSettings } from "./settings";
import {
  SplitRuleError,
  assertSplitRules,
  buildSplit,
  hashSplit,
  isSplitSignedBy,
  platformShare,
  splitFromStored,
  splitSigner,
  storedSplit,
  type SplitTable,
  type StoredSplit,
} from "./split";

export const purchaseIdToHex = (id: Uint8Array) => Buffer.from(id).toString("hex");
export const hexToPurchaseId = (hex: string) => Buffer.from(hex, "hex");

/** A submitted payment with no receipt after this long was dropped by the network. */
export const DROPPED_AFTER_MS = 30 * 60 * 1000;
/** A prepared Purchase is never signable past the contract's split validity cap. */
export const PREPARED_TTL_MS = 24 * 60 * 60 * 1000;

const IN_FLIGHT = ["submitting", "submitted"] as const;

/**
 * A purchase that still gives access right now (G4): confirmed or soft confirmed and,
 * for a product with an access period, before its end. An ended period leaves the fan
 * free to buy the product again.
 */
export const accessStillOpen = (now: Date) => ({
  OR: [{ accessUntil: null }, { accessUntil: { gt: now } }],
});

export class PurchaseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseInputError";
  }
}

type Refused = {
  refused: true;
  reason: PurchaseRefusal;
  purchaseId?: string;
  amount?: string;
  shortBy?: string;
  /** policy_changed: the live store policy version the fan must see first */
  policyVersion?: number;
};

export type ReceiveAuthorizationPayload = {
  domain: Awaited<ReturnType<typeof usdcDomain>>;
  types: typeof RECEIVE_WITH_AUTHORIZATION_TYPES;
  primaryType: "ReceiveWithAuthorization";
  message: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
};

export type PreparePurchaseResult =
  | Refused
  | {
      refused: false;
      purchaseId: string;
      typedData: ReceiveAuthorizationPayload;
      review: {
        amount: string;
        fee: string;
        feeBps: number;
        payer: Address;
        creatorHandle: string;
        chainId: number;
        network: string;
        validBefore: string;
        unscreened: boolean;
        /** C12: Referred by @handle when a promoter row is in the split */
        promoterHandle: string | null;
      };
    };

export type SubmitPurchaseResult =
  | Refused
  | { refused: false; purchaseId: string; status: PurchaseStatus; txHash: Hex | null };

async function today(userId: number, now: Date) {
  const where = {
    buyerUserId: userId,
    chainId: paymentChain.id,
    status: { in: [...PURCHASE_COUNTED_STATUSES] },
    createdAt: { gte: startOfUtcDay(now) },
  };
  const [count, sum] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { count, units: sum._sum.amount ?? 0n };
}

async function overDailyLimits(userId: number, amount: bigint, now: Date): Promise<boolean> {
  const settings = await paymentSettings(now.getTime());
  const { count, units } = await today(userId, now);
  return (
    count >= settings.purchasesPerDayPerAccount ||
    units + amount > settings.purchaseUsdcPerDayPerAccount
  );
}

async function setIntentStatus(
  intentId: Uint8Array | null,
  from: string[],
  status: "open" | "signing" | "submitted" | "paid"
) {
  if (!intentId) return;
  await prisma.checkoutIntent.updateMany({
    where: { id: Buffer.from(intentId), status: { in: from } },
    data: { status },
  });
}

/**
 * The store policy version a purchase carries: the one on the intent, or the live one when the
 * intent has none yet. A live version newer than the intent's refuses with `policy_changed`
 * and its version, unless `accepted` is that version; then the intent moves to it.
 */
async function policyForPurchase(
  intent: { id: Uint8Array; storePolicyVersionId: Uint8Array | null },
  creatorUserId: number,
  accepted: number | undefined
): Promise<{ versionId: Buffer | null; refused: Refused | null }> {
  const live = await liveVersion(creatorUserId);
  if (!live) return { versionId: null, refused: null };
  const liveId = Buffer.from(live.id);
  const shown = intent.storePolicyVersionId ? Buffer.from(intent.storePolicyVersionId) : null;
  if (shown && !shown.equals(liveId) && accepted !== live.version) {
    return {
      versionId: null,
      refused: { refused: true, reason: "policy_changed", policyVersion: live.version },
    };
  }
  if (!shown || !shown.equals(liveId)) {
    await prisma.checkoutIntent.update({
      where: { id: Buffer.from(intent.id) },
      data: { storePolicyVersionId: liveId },
    });
  }
  return { versionId: liveId, refused: null };
}

function authorizationMessage(split: SplitTable, contract: Address, splitHash: Hex) {
  return {
    from: split.payer,
    to: contract,
    value: split.amount,
    validAfter: 0n,
    validBefore: split.validBefore,
    nonce: splitHash,
  };
}

export async function preparePurchase(
  userId: number,
  input: { intentId: string; amount: string; signer?: string; policyVersion?: number },
  now = new Date()
): Promise<PreparePurchaseResult> {
  const intent = await prisma.checkoutIntent.findUnique({
    where: { id: hexToIntentId(input.intentId) },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      creatorUserId: true,
      userId: true,
      status: true,
      expiresAt: true,
      via: true,
      storePolicyVersionId: true,
      rnsName: true,
    },
  });
  // Only the fan who claimed the intent; anyone else gets the same not found
  if (!intent || intent.userId !== userId) throw notFound();
  const intentStatus = effectiveStatus(intent, now);
  if (intentStatus === "expired") throw notFound();

  const [owned, inFlight] = await Promise.all([
    prisma.purchase.findFirst({
      where: {
        buyerUserId: userId,
        targetType: intent.targetType,
        targetId: intent.targetId,
        status: { in: [...PURCHASE_ACCESS_STATUSES] },
        // A product whose access period ended can be bought again (G4)
        ...accessStillOpen(now),
      },
      select: { id: true },
    }),
    prisma.purchase.findFirst({
      // Any intent for the same item: two tabs or devices must not pay twice
      where: {
        buyerUserId: userId,
        targetType: intent.targetType,
        targetId: intent.targetId,
        status: { in: [...IN_FLIGHT] },
      },
      select: { id: true },
    }),
  ]);
  if (owned) return { refused: true, reason: "owned", purchaseId: purchaseIdToHex(owned.id) };
  if (inFlight)
    return { refused: true, reason: "in_progress", purchaseId: purchaseIdToHex(inFlight.id) };

  const contract = ampedPayAddress();
  if (!contract || !paymentsReady()) return { refused: true, reason: "paused" };
  const settings = await paymentSettings(now.getTime());
  if (settings.paymentsPaused) return { refused: true, reason: "paused" };

  // A product (C9) or a single content item (CK-2): the same target the intent stored
  const resolved = await resolveTarget(targetOf(intent));
  if (!resolved) return { refused: true, reason: "removed" };
  const handle = resolved.item.creatorHandle;

  // The store policy the sheet showed (CK-5, store policy 3.6). A newer live version refuses
  // until the fan has seen it and accepts it by sending its version.
  // A merchant's store policy is its own published URL, shown on the sheet (AB-2)
  const policy = resolved.extra.merchantId
    ? { versionId: null, refused: null }
    : await policyForPurchase(intent, resolved.creatorUserId, input.policyVersion);
  if (policy.refused) return policy.refused;

  // AB-1 (authbase-storefront 3.1, M1, M11): a merchant offer pays the merchant's effective
  // payout wallet as the merchant row, at the merchant's fee, after checkMerchant passes. The
  // payout wallet is screened in the screening step below like a creator's wallet.
  const merchantId = resolved.extra.merchantId
    ? Buffer.from(resolved.extra.merchantId, "hex")
    : null;
  let creator: Address;
  let platformFeeBps = settings.platformFeeBps;
  if (merchantId) {
    const merchant = await checkMerchant(merchantId, { screen: false });
    if (!merchant.pass) return { refused: true, reason: "seller" };
    creator = merchant.payoutWallet;
    platformFeeBps = merchant.feeBps;
  } else {
    const creatorWallet = await prisma.userWallet.findUnique({
      where: { userId: resolved.creatorUserId },
      select: { address: true },
    });
    if (
      !creatorWallet?.address ||
      !isAddress(creatorWallet.address, { strict: false }) ||
      (settings.pilotOnly && !settings.pilotCreators.includes(handle))
    ) {
      return { refused: true, reason: "seller" };
    }
    creator = getAddress(creatorWallet.address);
    // The seller gate is enforced here too, not only in the quote (AB-6, identity checks 5.3):
    // prepare is callable on its own, so a creator who fails it must not get a signed split.
    // A merchant offer runs checkMerchant above instead: the personal check cannot verify a
    // company or a Safe (M1).
    if (!(await checkIdentity(resolved.creatorUserId, "seller")).pass) {
      return { refused: true, reason: "seller" };
    }
  }

  const chainState = await readContractState(now.getTime());
  if (!chainState?.ok) return { refused: true, reason: "paused" };
  if (chainState.value.paused) return { refused: true, reason: "paused" };
  const limits = limitsFromState(chainState.value);

  // The price the sheet showed must still be the price
  const amount = resolved.extra.amountUnits ?? (await checkoutAmount(settings));
  if (amount.toString() !== input.amount) {
    return { refused: true, reason: "price", amount: amount.toString() };
  }
  if (await overDailyLimits(userId, amount, now)) return { refused: true, reason: "limit" };

  const fan = await prisma.user.findUnique({
    where: { id: userId },
    select: { wallet: { select: { address: true } } },
  });
  if (!fan?.wallet?.address || !isAddress(fan.wallet.address, { strict: false })) {
    return { refused: true, reason: "no_wallet" };
  }
  const payer = getAddress(fan.wallet.address);
  // After an account switch the browser can still hold the previous account's wallet
  if (
    input.signer !== undefined &&
    (!isAddress(input.signer, { strict: false }) || !isAddressEqual(input.signer, payer))
  ) {
    return { refused: true, reason: "wallet_mismatch" };
  }
  if (isAddressEqual(payer, creator)) return { refused: true, reason: "seller" };

  const balance = await getUsdcBalance(payer);
  if (balance < amount) {
    return {
      refused: true,
      reason: "insufficient_balance",
      shortBy: (amount - balance).toString(),
    };
  }

  let unscreened = false;
  try {
    const own = await screenAddress(payer, "own_address", userId);
    const seller = own.allowed ? await screenAddress(creator, "send_destination", userId) : own;
    if (!own.allowed || !seller.allowed) return { refused: true, reason: "screening" };
    unscreened = Boolean(own.unscreened || seller.unscreened);
  } catch (error) {
    if (error instanceof ScreeningUnavailableError) return { refused: true, reason: "paused" };
    throw error;
  }

  // C12: a promoter row when the intent carries an active, in scope code. A bad code sells
  // without one; it never stops the sale
  // Merchant sales carry no promoter row (spec 3.1)
  const promoter = merchantId
    ? null
    : await resolvePromoter({
        via: intent.via,
        creatorUserId: resolved.creatorUserId,
        targetId: intent.targetType === "offer" ? intent.targetId : null,
        buyerUserId: userId,
        payer,
        platformFeeBps: settings.platformFeeBps,
        minCreatorBps: limits.minCreatorBps,
        now,
        screen: true,
      });

  const id = uuidv7();
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
  const validity = Math.min(settings.quoteWindowSeconds, limits.maxSplitValidity);
  const split = buildSplit({
    paymentRef: purchasePaymentRef(id),
    payer,
    amount,
    creator,
    treasury: chainState.value.treasury,
    platformFeeBps,
    promoter: promoter ? { to: promoter.to, bps: promoter.bps } : null,
    validBefore: nowSeconds + BigInt(validity),
    sellerRole: merchantId ? SPLIT_ROLES.merchant : SPLIT_ROLES.creator,
  });
  try {
    assertSplitRules(split, limits, chainState.value.treasury, nowSeconds);
  } catch (error) {
    // A settings value the contract would refuse: never spend relayer gas on it
    if (error instanceof SplitRuleError) {
      console.error("[payments] split table breaks a contract rule", error.rule);
      return { refused: true, reason: "paused" };
    }
    throw error;
  }

  const splitHash = hashSplit(split, paymentChain.id, contract);
  let signature: Hex;
  try {
    signature = await splitSigner().sign(split, paymentChain.id, contract);
  } catch (error) {
    console.error("[payments] the split signer did not sign", error);
    return { refused: true, reason: "paused" };
  }
  // The contract checks the signer it stores; a rotated signer must not cost gas
  if (
    !(await isSplitSignedBy(
      split,
      paymentChain.id,
      contract,
      signature,
      chainState.value.splitSigner
    ))
  ) {
    console.error("[payments] split signature does not recover to the contract's splitSigner");
    return { refused: true, reason: "paused" };
  }

  const fee = platformShare(split);
  // A newer prepare replaces an unsigned one for the same intent
  await prisma.purchase.updateMany({
    where: { checkoutIntentId: intent.id, status: "prepared" },
    data: { status: "expired" },
  });
  await prisma.purchase.create({
    data: {
      id,
      checkoutIntentId: intent.id,
      buyerUserId: userId,
      creatorUserId: resolved.creatorUserId,
      targetType: intent.targetType,
      targetId: intent.targetId,
      // A product purchase names its offer, so Sales and access can read it (C10)
      offerId: intent.targetType === "offer" ? Buffer.from(intent.targetId, "hex") : null,
      promoterCodeId: promoter?.codeId ?? null,
      // The store policy the buyer was shown (store policy 3.6); null before one is published
      storePolicyVersionId: policy.versionId,
      merchantId,
      // AB-2: a service order starts unfulfilled; the merchant reports progress (AB-4)
      fulfillmentState: merchantId ? "paid" : null,
      rnsName: merchantId ? intent.rnsName : null,
      chainId: paymentChain.id,
      payer,
      creatorAddress: creator,
      amount,
      fee,
      splitHash,
      split: storedSplit(split, signature),
      status: "prepared",
    },
  });
  await setIntentStatus(intent.id, ["open", "awaiting_funds", "signing"], "signing");

  const auth = authorizationMessage(split, contract, splitHash);
  return {
    refused: false,
    purchaseId: purchaseIdToHex(id),
    typedData: {
      domain: await usdcDomain(),
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: auth.from,
        to: auth.to,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
    },
    review: {
      amount: amount.toString(),
      fee: fee.toString(),
      feeBps: platformFeeBps,
      payer,
      creatorHandle: handle,
      chainId: paymentChain.id,
      network: paymentChain.name,
      validBefore: new Date(Number(split.validBefore) * 1000).toISOString(),
      unscreened,
      promoterHandle: promoter?.handle ?? null,
    },
  };
}

type PurchaseRow = NonNullable<Awaited<ReturnType<typeof findPurchase>>>;

function findPurchase(id: Buffer) {
  return prisma.purchase.findUnique({ where: { id } });
}

async function ownPurchase(userId: number, idHex: string): Promise<PurchaseRow> {
  const row = await findPurchase(hexToPurchaseId(idHex));
  if (!row || row.buyerUserId !== userId) {
    throw new PurchaseInputError("This payment was not found. Start again.");
  }
  return row;
}

function splitOf(row: PurchaseRow): { split: SplitTable; stored: StoredSplit } {
  const stored = row.split as unknown as StoredSplit;
  return {
    stored,
    split: splitFromStored(stored, {
      paymentRef: purchasePaymentRef(row.id),
      payer: row.payer as Address,
      amount: row.amount,
    }),
  };
}

/** The AmpedPay.pay calldata for a stored Purchase and the fan's authorization signature. */
export function encodePayCall(row: PurchaseRow, authSignature: Hex): Hex {
  const { split, stored } = splitOf(row);
  return encodeFunctionData({
    abi: AMPEDPAY_ABI,
    functionName: "pay",
    args: [
      {
        paymentRef: split.paymentRef,
        payer: split.payer,
        amount: split.amount,
        recipients: split.recipients.map(r => ({ to: r.to, bps: r.bps, role: r.role })),
        validBefore: split.validBefore,
      },
      stored.signature,
      0n,
      split.validBefore,
      authSignature,
    ],
  });
}

export async function submitPurchase(
  userId: number,
  input: { purchaseId: string; signature: string },
  now = new Date(),
  receiptWaitMs = 20_000
): Promise<SubmitPurchaseResult> {
  const row = await ownPurchase(userId, input.purchaseId);
  const purchaseId = purchaseIdToHex(row.id);
  if (row.status !== "prepared") {
    // A second tap or a retry after a lost response: report what happened
    if (["submitting", "submitted", "confirmed_soft", "confirmed"].includes(row.status)) {
      return {
        refused: false,
        purchaseId,
        status: row.status as PurchaseStatus,
        txHash: (row.txHash as Hex | null) ?? null,
      };
    }
    throw new PurchaseInputError("This payment can no longer be sent. Start again.");
  }

  const contract = ampedPayAddress();
  const { split } = splitOf(row);
  if (split.validBefore <= BigInt(Math.floor(now.getTime() / 1000))) {
    await prisma.purchase.updateMany({
      where: { id: row.id, status: "prepared" },
      data: { status: "expired" },
    });
    throw new PurchaseInputError("This payment expired. Start again.");
  }
  if (!contract || !paymentsReady()) return { refused: true, reason: "paused" };
  if ((await paymentSettings(now.getTime())).paymentsPaused) {
    return { refused: true, reason: "paused" };
  }
  if (await overDailyLimits(userId, row.amount, now)) {
    // Only a row still prepared: a concurrent tap may have claimed it already
    await prisma.purchase.updateMany({
      where: { id: row.id, status: "prepared" },
      data: { status: "failed", failureCode: "limit" },
    });
    return { refused: true, reason: "limit" };
  }
  // Funds can leave between prepare and submit; the contract would revert on relayer gas
  const balance = await getUsdcBalance(row.payer as Address);
  if (balance < row.amount) {
    return {
      refused: true,
      reason: "insufficient_balance",
      shortBy: (row.amount - balance).toString(),
    };
  }

  const signature = input.signature as Hex;
  let signer: Address | null = null;
  try {
    signer = await recoverTypedDataAddress({
      domain: await usdcDomain(),
      types: RECEIVE_WITH_AUTHORIZATION_TYPES,
      primaryType: "ReceiveWithAuthorization",
      message: authorizationMessage(split, contract, row.splitHash as Hex),
      signature,
    });
  } catch {
    signer = null;
  }
  if (!signer || !isAddressEqual(signer, row.payer as Address)) {
    throw new PurchaseInputError("The signature does not match this payment. Start again.");
  }

  const claimed = await prisma.purchase.updateMany({
    where: { id: row.id, status: "prepared" },
    data: { status: "submitting" },
  });
  if (claimed.count === 0)
    return { refused: false, purchaseId, status: "submitting", txHash: null };

  // A second purchase of the same item (another tab or device prepared one too) must not
  // pay. Checked after the claim, so of two concurrent submits at least one sees the other;
  // when both do, both step back and nothing is charged.
  const other = await prisma.purchase.findFirst({
    where: {
      id: { not: row.id },
      buyerUserId: userId,
      targetType: row.targetType,
      targetId: row.targetId,
      OR: [
        // A payment already on its way, whatever its age
        { status: { in: [...IN_FLIGHT] } },
        // Access already owned, so a second payment adds nothing. An ended access
        // period (G4) does not block the fan from buying again
        { status: { in: [...PURCHASE_ACCESS_STATUSES] }, ...accessStillOpen(now) },
      ],
    },
    select: { id: true, status: true },
  });
  if (other) {
    await prisma.purchase.updateMany({
      where: { id: row.id, status: "submitting" },
      data: { status: "failed", failureCode: "duplicate" },
    });
    const owned = (PURCHASE_ACCESS_STATUSES as readonly string[]).includes(other.status);
    return {
      refused: true,
      reason: owned ? "owned" : "in_progress",
      purchaseId: purchaseIdToHex(other.id),
    };
  }

  let txHash: Hex;
  try {
    txHash = await getRelayer().call(contract, encodePayCall(row, signature), purchaseId);
  } catch (error) {
    const code = error instanceof RelayerError ? error.code : "unavailable";
    await prisma.purchase.update({
      where: { id: row.id },
      data: { status: "failed", failureCode: code },
    });
    await setIntentStatus(row.checkoutIntentId, ["signing"], "open");
    if (code === "reverted") return { refused: false, purchaseId, status: "failed", txHash: null };
    return { refused: true, reason: "paused" };
  }

  await prisma.purchase.update({ where: { id: row.id }, data: { status: "submitted", txHash } });
  await setIntentStatus(row.checkoutIntentId, ["open", "awaiting_funds", "signing"], "submitted");
  const status = await settlePurchase(row.id, { waitMs: receiptWaitMs, now });
  return { refused: false, purchaseId, status, txHash };
}

type DecodedPaymentLog =
  | {
      kind: "purchase_paid";
      paymentRef: Hex;
      payer: Address;
      creator: Address;
      amount: bigint;
      splitHash: Hex;
    }
  | { kind: "purchase_share"; paymentRef: Hex; to: Address; role: number; amount: bigint }
  | {
      kind: "purchase_refunded";
      paymentRef: Hex;
      payer: Address;
      creator: Address;
      amount: bigint;
    };

/** AmpedPay Paid, Share and Refunded logs from a receipt or getLogs, other logs skipped. */
export function decodePaymentLogs(
  logs: readonly Log[],
  contract: Address
): (DecodedPaymentLog & { log: Log })[] {
  const out: (DecodedPaymentLog & { log: Log })[] = [];
  for (const log of logs) {
    if (!isAddressEqual(log.address, contract)) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: AMPEDPAY_ABI, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    const args = decoded.args as Record<string, unknown>;
    switch (decoded.eventName) {
      case "Paid":
        out.push({
          log,
          kind: "purchase_paid",
          paymentRef: args.paymentRef as Hex,
          payer: getAddress(args.payer as Address),
          creator: getAddress(args.creator as Address),
          amount: args.amount as bigint,
          splitHash: args.splitHash as Hex,
        });
        break;
      case "Share":
        out.push({
          log,
          kind: "purchase_share",
          paymentRef: args.paymentRef as Hex,
          to: getAddress(args.to as Address),
          role: Number(args.role),
          amount: args.amount as bigint,
        });
        break;
      case "Refunded":
        out.push({
          log,
          kind: "purchase_refunded",
          paymentRef: args.paymentRef as Hex,
          payer: getAddress(args.payer as Address),
          creator: getAddress(args.creator as Address),
          amount: args.amount as bigint,
        });
        break;
    }
  }
  return out;
}

/** Stores decoded AmpedPay logs as PaymentEvent rows, once each. Returns the rows written. */
export async function recordPaymentLogs(
  events: (DecodedPaymentLog & { log: Log })[],
  occurredAt: (blockNumber: bigint) => Promise<Date> | Date,
  contract: Address
): Promise<number> {
  let written = 0;
  for (const event of events) {
    const { log } = event;
    if (!log.transactionHash || log.blockNumber === null || log.logIndex === null) continue;
    const idHex = purchaseIdFromPaymentRef(event.paymentRef);
    const purchase = idHex
      ? await prisma.purchase.findUnique({
          where: { id: hexToPurchaseId(idHex) },
          select: { id: true, buyerUserId: true, creatorUserId: true, fee: true },
        })
      : null;
    const base = {
      id: uuidv7(),
      chainId: paymentChain.id,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash ?? null,
      paymentRef: event.paymentRef,
      refType: purchase ? "purchase" : null,
      refId: purchase ? Buffer.from(purchase.id) : null,
      amount: event.amount,
      occurredAt: await occurredAt(log.blockNumber),
    };
    const data =
      event.kind === "purchase_paid"
        ? {
            ...base,
            kind: event.kind,
            fromAddress: event.payer,
            toAddress: event.creator,
            payerUserId: purchase?.buyerUserId ?? null,
            payeeUserId: purchase?.creatorUserId ?? null,
            fee: purchase?.fee ?? 0n,
            splitHash: event.splitHash,
          }
        : event.kind === "purchase_share"
          ? {
              ...base,
              kind: event.kind,
              fromAddress: contract,
              toAddress: event.to,
              payeeUserId:
                event.role === SPLIT_ROLES.creator ? (purchase?.creatorUserId ?? null) : null,
              role: event.role,
            }
          : {
              ...base,
              kind: event.kind,
              fromAddress: event.creator,
              toAddress: event.payer,
              payerUserId: purchase?.creatorUserId ?? null,
              payeeUserId: purchase?.buyerUserId ?? null,
            };
    try {
      await prisma.paymentEvent.create({ data });
      written += 1;
    } catch (error) {
      // Already stored by an earlier pass
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
  }
  return written;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The end of a product's access period (G4, ST-Q44 "Access for N days"), counted from the
 * first chain confirmation. Lifetime products, content and rows that already carry an end
 * are left as they are.
 */
async function accessWindow(row: PurchaseRow, from: Date): Promise<{ accessUntil?: Date }> {
  if (!row.offerId || row.accessUntil) return {};
  const offer = await prisma.offer.findUnique({
    where: { id: Buffer.from(row.offerId) },
    select: { accessPeriodDays: true },
  });
  if (!offer?.accessPeriodDays) return {};
  return { accessUntil: new Date(from.getTime() + offer.accessPeriodDays * DAY_MS) };
}

/**
 * Moves one in flight Purchase forward from its receipt. Safe to call from submit, the status
 * poll, the worker and the indexer: every write names the statuses it moves from.
 */
export async function settlePurchase(
  id: Uint8Array,
  options: { waitMs?: number; now?: Date } = {}
): Promise<PurchaseStatus> {
  const now = options.now ?? new Date();
  const row = await findPurchase(Buffer.from(id));
  if (!row) throw new PurchaseInputError("This payment was not found.");
  const status = row.status as PurchaseStatus;
  if (!row.txHash || !["submitted", "confirmed_soft", "failed"].includes(status)) return status;
  const contract = ampedPayAddress();
  if (!contract) return status;
  const client = paymentClient();
  const hash = row.txHash as Hex;

  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  try {
    receipt =
      options.waitMs && options.waitMs > 0
        ? await client.waitForTransactionReceipt({ hash, timeout: options.waitMs })
        : await client.getTransactionReceipt({ hash });
  } catch {
    receipt = null;
  }

  if (!receipt) {
    if (status === "confirmed_soft") {
      // The block that held it is gone (reorg): access closes until it lands again
      const moved = await prisma.purchase.updateMany({
        where: { id: row.id, status: "confirmed_soft" },
        data: {
          status: "submitted",
          blockNumber: null,
          blockHash: null,
          softConfirmedAt: null,
          // A product period restarts when the payment lands again
          ...(row.offerId ? { accessUntil: null } : {}),
        },
      });
      if (moved.count) {
        console.warn("[payments] purchase receipt vanished after soft confirm", hash);
        await setIntentStatus(row.checkoutIntentId, ["paid"], "submitted");
        return "submitted";
      }
    } else if (
      status === "submitted" &&
      now.getTime() - row.updatedAt.getTime() > DROPPED_AFTER_MS &&
      // Until validBefore the transaction can still land; reopening the intent earlier would
      // let the fan pay a second time
      BigInt(Math.floor(now.getTime() / 1000)) > splitOf(row).split.validBefore
    ) {
      const moved = await prisma.purchase.updateMany({
        where: { id: row.id, status: "submitted" },
        data: { status: "failed", failureCode: "dropped" },
      });
      if (moved.count) {
        await setIntentStatus(row.checkoutIntentId, ["submitted"], "open");
        return "failed";
      }
    }
    return status;
  }

  const gas = {
    gasUsed: receipt.gasUsed,
    gasCostWei: receipt.gasUsed * receipt.effectiveGasPrice,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
  };
  const ref = purchasePaymentRef(row.id);
  const events = receipt.status === "success" ? decodePaymentLogs(receipt.logs, contract) : [];
  const paid = events.find(e => e.kind === "purchase_paid" && e.paymentRef.toLowerCase() === ref);
  if (receipt.status !== "success" || !paid) {
    const moved = await prisma.purchase.updateMany({
      where: { id: row.id, status: { in: ["submitted", "confirmed_soft"] } },
      data: {
        status: "failed",
        failureCode: receipt.status === "success" ? "no_paid_event" : "reverted",
        ...gas,
      },
    });
    if (moved.count) await setIntentStatus(row.checkoutIntentId, ["submitted", "paid"], "open");
    return moved.count ? "failed" : status;
  }

  const settings = await paymentSettings(now.getTime());
  const head = await client.getBlockNumber();
  const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;

  if (confirmations >= BigInt(settings.finalConfirmations)) {
    // A failed row comes back here only when the indexer found its Paid log
    const moved = await prisma.purchase.updateMany({
      where: { id: row.id, status: { in: ["submitted", "confirmed_soft", "failed"] } },
      data: {
        status: "confirmed",
        failureCode: null,
        confirmedAt: now,
        softConfirmedAt: row.softConfirmedAt ?? now,
        ...(await accessWindow(row, row.softConfirmedAt ?? now)),
        ...gas,
      },
    });
    if (!moved.count) return status;
    // C10: a product counts a sale once, when it is final
    await countFinalSale(row.id);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    await recordPaymentLogs(events, () => new Date(Number(block.timestamp) * 1000), contract);
    await setIntentStatus(row.checkoutIntentId, ["open", "signing", "submitted"], "paid");
    await sendPurchaseReceipt(row.id).catch(error =>
      console.error("[payments] receipt email failed, the worker retries", error)
    );
    return "confirmed";
  }

  if (confirmations >= BigInt(settings.softUnlockConfirmations)) {
    if (status === "confirmed_soft") {
      await prisma.purchase.update({ where: { id: row.id }, data: gas });
      return status;
    }
    const moved = await prisma.purchase.updateMany({
      where: { id: row.id, status: { in: ["submitted", "failed"] } },
      data: {
        status: "confirmed_soft",
        failureCode: null,
        softConfirmedAt: now,
        ...(await accessWindow(row, now)),
        ...gas,
      },
    });
    if (!moved.count) return status;
    await setIntentStatus(row.checkoutIntentId, ["open", "signing", "submitted"], "paid");
    return "confirmed_soft";
  }

  await prisma.purchase.update({ where: { id: row.id }, data: gas });
  return status;
}

/**
 * The pay sheet polls this after submit (content spec 3.9 step 5). `unlocked` opens the item;
 * `final` means the receipt went out.
 */
/**
 * The newest purchase this fan started from an intent, as purchaseStatus reads it (CK-5): the
 * pay sheet shows Checking on a return to a signing or submitted intent (mobile checkout 9).
 * Null when nothing was sent yet.
 */
export async function purchaseForIntent(userId: number, intentIdHex: string) {
  const row = await prisma.purchase.findFirst({
    where: {
      buyerUserId: userId,
      checkoutIntentId: hexToIntentId(intentIdHex),
      status: { notIn: ["prepared", "expired"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row ? purchaseStatus(userId, purchaseIdToHex(row.id)) : null;
}

export async function purchaseStatus(userId: number, idHex: string) {
  const row = await ownPurchase(userId, idHex);
  let status = row.status as PurchaseStatus;
  if (status === "submitted" || status === "confirmed_soft") {
    status = await settlePurchase(row.id, { waitMs: 0 });
  }
  const explorer = paymentChain.blockExplorers?.default.url ?? null;
  return {
    purchaseId: purchaseIdToHex(row.id),
    status,
    unlocked: (PURCHASE_ACCESS_STATUSES as readonly string[]).includes(status),
    final: status === "confirmed",
    txHash: row.txHash,
    txUrl: row.txHash && explorer ? `${explorer}/tx/${row.txHash}` : null,
    amount: row.amount.toString(),
    fee: row.fee.toString(),
    target: { type: row.targetType, id: row.targetId },
  };
}

/**
 * The targets this fan has paid for among the given ids (the `paid` check, G4; Library).
 * confirmed_soft counts: mobile checkout D4 opens access at the relayer's receipt.
 */
export async function purchasedTargets(
  userId: number,
  targetType: string,
  targetIds: string[],
  now = new Date()
): Promise<Set<string>> {
  if (targetIds.length === 0) return new Set();
  const rows = await prisma.purchase.findMany({
    where: {
      buyerUserId: userId,
      targetType,
      targetId: { in: targetIds },
      status: { in: [...PURCHASE_ACCESS_STATUSES] },
      OR: [{ accessUntil: null }, { accessUntil: { gt: now } }],
    },
    select: { targetId: true },
  });
  return new Set(rows.map(row => row.targetId));
}

export async function hasPurchased(
  userId: number,
  targetType: string,
  targetId: string,
  now = new Date()
): Promise<boolean> {
  return (await purchasedTargets(userId, targetType, [targetId], now)).has(targetId);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Sends the receipt once (mobile checkout D4: at final). Returns false when already sent. */
export async function sendPurchaseReceipt(id: Uint8Array): Promise<boolean> {
  const claimed = await prisma.purchase.updateMany({
    where: { id: Buffer.from(id), status: "confirmed", receiptSentAt: null },
    data: { receiptSentAt: new Date() },
  });
  if (claimed.count === 0) return false;
  try {
    const row = await prisma.purchase.findUnique({
      where: { id: Buffer.from(id) },
      select: {
        id: true,
        amount: true,
        fee: true,
        txHash: true,
        targetId: true,
        confirmedAt: true,
        buyer: { select: { email: true, name: true } },
        creator: { select: { handle: true } },
      },
    });
    if (!row?.buyer?.email) return false;
    const [item, settings] = await Promise.all([
      prisma.contentItem.findUnique({
        where: { publicId: row.targetId },
        select: { title: true, publicId: true },
      }),
      paymentSettings(),
    ]);
    const handle = row.creator?.handle ?? "creator";
    const title = item?.title ?? "Your purchase";
    const explorer = paymentChain.blockExplorers?.default.url ?? null;
    const html = await render(
      PurchaseReceiptTemplate({
        firstName: row.buyer.name?.split(" ")[0] || undefined,
        itemTitle: title,
        creatorHandle: handle,
        amount: usdcDollarsLabel(row.amount),
        fee: usdcDollarsLabel(row.fee),
        feePercent: `${settings.platformFeeBps / 100}%`,
        paidOn: formatDate(row.confirmedAt ?? new Date()),
        receiptId: purchaseIdToHex(row.id).slice(-12).toUpperCase(),
        network: paymentChain.name,
        txUrl: row.txHash && explorer ? `${explorer}/tx/${row.txHash}` : null,
        openUrl: item?.publicId
          ? new URL(`/${handle}/c/${item.publicId}`, env.LANDINGPAGE_URL).toString()
          : new URL(`/${handle}`, env.LANDINGPAGE_URL).toString(),
        refundWindowDays: settings.refundWindowDays,
        privacyUrl: new URL("/privacy", env.LANDINGPAGE_URL).toString(),
      })
    );
    await deliverEmail({
      to: [row.buyer.email],
      subject: `Your receipt for ${title}`,
      html,
    });
    return true;
  } catch (error) {
    // Let the worker try again
    await prisma.purchase.update({
      where: { id: Buffer.from(id) },
      data: { receiptSentAt: null },
    });
    throw error;
  }
}
