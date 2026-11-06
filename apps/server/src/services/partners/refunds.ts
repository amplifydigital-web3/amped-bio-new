import { getAddress, type Address, type Hex } from "viem";
import { prisma } from "@repo/database";
import {
  REFUND_TYPES,
  USDC_NONCES_ABI,
  USDC_PERMIT_TYPES,
  ampedPayDomain,
  purchasePaymentRef,
} from "@repo/web3";
import { getUsdcBalance, paymentChain, paymentClient, usdcDomain } from "../usdc/chain";
import { RelayerError, getRelayer } from "../usdc/relayer";
import { ampedPayAddress } from "../payments/onchain";
import { paymentsReady } from "../payments/ready";
import { paymentSettings } from "../payments/settings";
import { encodeRefundCall, refundWindowOpen } from "../store/sales";
import { OrderError } from "./orders";

/**
 * Merchant refunds through the Partner API (Build Board #66, AB-4; partner spec 11, M6). The
 * payout wallet that took the sale signs an EIP-712 Refund and an EIP-2612 permit for its share.
 * Both are checked with viem's verifyTypedData, which takes EOA and ERC-1271 (Safe) signatures,
 * before the relayer spends gas. The treasury returns the Amped.Bio share in the same call.
 * Deadlines are 24 hours so a Safe has time to collect its signers.
 */

const DEADLINE_SECONDS = 24 * 60 * 60;
const REFUNDABLE = ["confirmed_soft", "confirmed"];

async function refundableOrder(merchantId: Buffer, ref: string, now: Date) {
  if (!/^[0-9a-f]{32}$/.test(ref)) throw new OrderError(404, "not_found", "Unknown order.");
  const row = await prisma.purchase.findUnique({ where: { id: Buffer.from(ref, "hex") } });
  if (!row || !row.merchantId || !Buffer.from(row.merchantId).equals(merchantId)) {
    throw new OrderError(404, "not_found", "Unknown order.");
  }
  if (row.status === "refunded" || row.refundRequestedAt) {
    throw new OrderError(409, "already_refunded", "This order is already refunded or refunding.");
  }
  if (!REFUNDABLE.includes(row.status))
    throw new OrderError(409, "not_refundable", "Only a paid order can be refunded.");
  if (row.chainId !== paymentChain.id)
    throw new OrderError(409, "not_refundable", "This order was paid on another network.");
  const settings = await paymentSettings(now.getTime());
  if (!refundWindowOpen(row, settings.refundWindowDays, now)) {
    throw new OrderError(409, "window_closed", "The refund window for this order has closed.");
  }
  const contract = ampedPayAddress();
  if (!contract || !paymentsReady() || settings.paymentsPaused) {
    throw new OrderError(503, "paused", "Payments are paused. Try again later.");
  }
  return { row, contract, signer: getAddress(row.creatorAddress) };
}

export async function prepareMerchantRefund(merchantId: Buffer, ref: string, now = new Date()) {
  const { row, contract, signer } = await refundableOrder(merchantId, ref, now);
  const fromWallet = row.amount - row.fee;
  const usdc = await usdcDomain();
  const nonce = await paymentClient().readContract({
    address: usdc.verifyingContract as Address,
    abi: USDC_NONCES_ABI,
    functionName: "nonces",
    args: [signer],
  });
  const deadline = BigInt(Math.floor(now.getTime() / 1000) + DEADLINE_SECONDS);
  return {
    order_ref: ref,
    signer,
    amount_units: row.amount.toString(),
    from_payout_wallet_units: fromWallet.toString(),
    from_treasury_units: row.fee.toString(),
    refund: {
      domain: ampedPayDomain(paymentChain.id, contract),
      types: REFUND_TYPES,
      primaryType: "Refund",
      message: { paymentRef: purchasePaymentRef(row.id), deadline: deadline.toString() },
    },
    permit: {
      domain: {
        name: usdc.name,
        version: usdc.version,
        chainId: paymentChain.id,
        verifyingContract: usdc.verifyingContract,
      },
      types: USDC_PERMIT_TYPES,
      primaryType: "Permit",
      message: {
        owner: signer,
        spender: contract,
        value: fromWallet.toString(),
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      },
    },
  };
}

export async function submitMerchantRefund(
  merchantId: Buffer,
  ref: string,
  input: {
    deadline: string;
    refund_signature: string;
    permit_deadline: string;
    permit_signature: string;
  },
  now = new Date()
) {
  const { row, contract, signer } = await refundableOrder(merchantId, ref, now);
  if (![input.deadline, input.permit_deadline].every(v => /^\d{1,12}$/.test(v))) {
    throw new OrderError(422, "invalid_deadline", "Send the deadlines from the prepare call.");
  }
  if (![input.refund_signature, input.permit_signature].every(v => /^0x[0-9a-fA-F]+$/.test(v))) {
    throw new OrderError(422, "invalid_signature", "Send hex signatures.");
  }
  const deadline = BigInt(input.deadline);
  const permitDeadline = BigInt(input.permit_deadline);
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000));
  if (deadline <= nowSeconds || permitDeadline <= nowSeconds) {
    throw new OrderError(422, "expired", "The signatures have expired. Prepare the refund again.");
  }
  const fromWallet = row.amount - row.fee;
  const paymentRef = purchasePaymentRef(row.id);
  const usdc = await usdcDomain();
  const client = paymentClient();
  const nonce = await client.readContract({
    address: usdc.verifyingContract as Address,
    abi: USDC_NONCES_ABI,
    functionName: "nonces",
    args: [signer],
  });
  let valid = false;
  try {
    const [refundOk, permitOk] = await Promise.all([
      client.verifyTypedData({
        address: signer,
        domain: ampedPayDomain(paymentChain.id, contract),
        types: REFUND_TYPES,
        primaryType: "Refund",
        message: { paymentRef, deadline },
        signature: input.refund_signature as Hex,
      }),
      client.verifyTypedData({
        address: signer,
        domain: {
          name: usdc.name,
          version: usdc.version,
          chainId: paymentChain.id,
          verifyingContract: usdc.verifyingContract as Address,
        },
        types: USDC_PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: signer,
          spender: contract,
          value: fromWallet,
          nonce,
          deadline: permitDeadline,
        },
        signature: input.permit_signature as Hex,
      }),
    ]);
    valid = refundOk && permitOk;
  } catch {
    valid = false;
  }
  if (!valid)
    throw new OrderError(
      422,
      "signature",
      "The signatures do not come from the payout wallet that took this sale."
    );
  if ((await getUsdcBalance(signer)) < fromWallet) {
    throw new OrderError(
      409,
      "insufficient_balance",
      "The payout wallet does not hold enough USDC for this refund."
    );
  }
  const claimed = await prisma.purchase.updateMany({
    where: { id: row.id, status: { in: REFUNDABLE }, refundRequestedAt: null },
    data: { refundRequestedAt: now },
  });
  if (claimed.count === 0) return { state: "refunding", tx_hash: null };
  try {
    const txHash = await getRelayer().call(
      contract,
      encodeRefundCall({
        paymentRef,
        deadline,
        refundSignature: input.refund_signature as Hex,
        permitDeadline,
        permitSignature: input.permit_signature as Hex,
      }),
      `refund:${ref}`
    );
    await prisma.purchase.update({ where: { id: row.id }, data: { refundTxHash: txHash } });
    return { state: "refunding", tx_hash: txHash };
  } catch (error) {
    await prisma.purchase.updateMany({
      where: { id: row.id, status: { not: "refunded" } },
      data: { refundRequestedAt: null },
    });
    const code = error instanceof RelayerError ? error.code : "unavailable";
    console.warn("[partners] refund not sent", ref, code);
    throw new OrderError(
      503,
      "relayer",
      "The refund could not be sent. Nothing left the payout wallet. Try again."
    );
  }
}
