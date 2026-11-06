import { randomBytes } from "node:crypto";
import { getAddress, isAddress, isAddressEqual, type Hex } from "viem";
import { prisma } from "@repo/database";
import { PAYOUT_WALLET_DELAY_MS, payoutWalletProofMessage } from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import { paymentChain, paymentClient } from "../usdc/chain";
import { ScreeningUnavailableError, screenAddress } from "../usdc/screen";
import { MERCHANT_SYSTEM_ACTOR, recordMerchantAudit } from "./audit";

/**
 * Payout wallet changes (docs/features/authbase-storefront.md 3.8, decision M2). A hijacked
 * wallet change is the largest loss in this design, so a change needs:
 *
 * 1. An Owner proposes the address with a signature from that wallet over the proof message
 *    (EOA, or ERC-1271 for a Safe; viem's verifyMessage checks both).
 * 2. A different Owner approves it with two factor (checked by the router).
 * 3. It takes effect 24 hours after approval, when the payments worker applies it. Every Owner
 *    gets an email at each step.
 *
 * Quotes signed before the change keep the old wallet: the split table is signed into the
 * Purchase at prepare. The payout_wallet.changed webhook is sent by the Partner API (AB-4).
 */

export class PayoutWalletError extends Error {}

/** Verifies a wallet signed the proof. Exported as a test seam. */
export type ProofVerifier = (params: {
  address: `0x${string}`;
  message: string;
  signature: Hex;
}) => Promise<boolean>;

const chainVerifier: ProofVerifier = async params => {
  try {
    return await paymentClient().verifyMessage(params);
  } catch {
    return false;
  }
};

let verifier: ProofVerifier = chainVerifier;

/** Test seam. */
export function setProofVerifierForTests(next: ProofVerifier | null) {
  verifier = next ?? chainVerifier;
}

async function memberRole(merchantId: Buffer, userId: number) {
  const member = await prisma.merchantMember.findUnique({
    where: { merchantId_userId: { merchantId, userId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

async function requireOwner(merchantId: Buffer, userId: number) {
  if ((await memberRole(merchantId, userId)) !== "owner") {
    throw new PayoutWalletError("Only an Owner can change the payout wallet.");
  }
}

async function emailOwners(merchantId: Buffer, subject: string, line: string) {
  const owners = await prisma.merchantMember.findMany({
    where: { merchantId, role: "owner" },
    select: { userId: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: owners.map(o => o.userId) } },
    select: { email: true },
  });
  const to = users.map(u => u.email).filter((e): e is string => Boolean(e));
  if (to.length === 0) return;
  try {
    await deliverEmail({
      to,
      subject,
      html: `<p>${line}</p><p>If you did not expect this, sign in to the Merchant Console and reject or cancel the change, then contact Amped.Bio support.</p>`,
    });
  } catch (error) {
    console.error("[merchants] payout wallet email failed", error);
  }
}

/** A fresh proof message for the Console to have the wallet sign. */
export async function proofChallenge(merchantIdHex: string, address: string) {
  if (!isAddress(address, { strict: false })) {
    throw new PayoutWalletError("Enter a valid Base address.");
  }
  const merchant = await prisma.merchant.findUnique({
    where: { id: Buffer.from(merchantIdHex, "hex") },
    select: { name: true },
  });
  if (!merchant) throw new PayoutWalletError("Merchant not found.");
  return payoutWalletProofMessage({
    merchantId: merchantIdHex,
    merchantName: merchant.name,
    address: getAddress(address),
    chainId: paymentChain.id,
    nonce: randomBytes(12).toString("hex"),
  });
}

export async function proposePayoutWallet(input: {
  merchantId: Buffer;
  userId: number;
  address: string;
  message: string;
  signature: Hex;
}) {
  await requireOwner(input.merchantId, input.userId);
  if (!isAddress(input.address, { strict: false })) {
    throw new PayoutWalletError("Enter a valid Base address.");
  }
  const address = getAddress(input.address);
  const merchant = await prisma.merchant.findUnique({
    where: { id: input.merchantId },
    select: { name: true },
  });
  if (!merchant) throw new PayoutWalletError("Merchant not found.");

  // The message must be ours, for this merchant, this address and this chain
  const expectedHead = payoutWalletProofMessage({
    merchantId: input.merchantId.toString("hex"),
    merchantName: merchant.name,
    address,
    chainId: paymentChain.id,
    nonce: "",
  })
    .split("\n")
    .slice(0, 4)
    .join("\n");
  if (!input.message.startsWith(expectedHead) || input.message.length > 500) {
    throw new PayoutWalletError("The signed message is not the payout wallet proof.");
  }
  if (!(await verifier({ address, message: input.message, signature: input.signature }))) {
    throw new PayoutWalletError("The signature does not come from this wallet.");
  }
  try {
    const screened = await screenAddress(address, "send_destination", input.userId);
    if (!screened.allowed) throw new PayoutWalletError("This wallet cannot receive payments.");
  } catch (error) {
    if (error instanceof ScreeningUnavailableError) {
      throw new PayoutWalletError("Screening is not available. Try again in a few minutes.");
    }
    throw error;
  }

  const current = await prisma.merchantPayoutWallet.findFirst({
    where: { merchantId: input.merchantId, status: "effective" },
    select: { address: true },
  });
  if (current && isAddressEqual(getAddress(current.address), address)) {
    throw new PayoutWalletError("This is already the payout wallet.");
  }

  const row = await prisma.$transaction(async tx => {
    // One open change at a time: a new proposal cancels any open one
    await tx.merchantPayoutWallet.updateMany({
      where: { merchantId: input.merchantId, status: { in: ["proposed", "approved"] } },
      data: { status: "cancelled" },
    });
    const created = await tx.merchantPayoutWallet.create({
      data: {
        id: uuidv7(),
        merchantId: input.merchantId,
        address,
        status: "proposed",
        proofMessage: input.message,
        proofSignature: input.signature,
        proposedById: input.userId,
      },
    });
    await recordMerchantAudit(
      input.merchantId,
      input.userId,
      "payout_wallet.proposed",
      { address },
      tx
    );
    return created;
  });
  await emailOwners(
    input.merchantId,
    "A new payout wallet was proposed",
    `A new payout wallet ${address} was proposed for ${merchant.name}. It needs a second Owner to approve it, then takes effect 24 hours later.`
  );
  return row;
}

export async function approvePayoutWallet(input: {
  merchantId: Buffer;
  walletId: Buffer;
  userId: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await requireOwner(input.merchantId, input.userId);
  const row = await prisma.merchantPayoutWallet.findUnique({ where: { id: input.walletId } });
  if (!row || !Buffer.from(row.merchantId).equals(input.merchantId)) {
    throw new PayoutWalletError("Change not found.");
  }
  if (row.status !== "proposed") throw new PayoutWalletError("This change is no longer open.");
  if (row.proposedById === input.userId) {
    throw new PayoutWalletError("A different Owner must approve this change.");
  }
  const effectiveAt = new Date(now.getTime() + PAYOUT_WALLET_DELAY_MS);
  const updated = await prisma.merchantPayoutWallet.updateMany({
    where: { id: input.walletId, status: "proposed" },
    data: { status: "approved", approvedById: input.userId, approvedAt: now, effectiveAt },
  });
  if (updated.count !== 1) throw new PayoutWalletError("This change is no longer open.");
  await recordMerchantAudit(input.merchantId, input.userId, "payout_wallet.approved", {
    address: row.address,
    effectiveAt: effectiveAt.toISOString(),
  });
  await emailOwners(
    input.merchantId,
    "Payout wallet change approved",
    `The payout wallet ${row.address} was approved. It takes effect on ${effectiveAt.toUTCString()}.`
  );
  return { effectiveAt };
}

/** Reject a proposal, or cancel an approved change before it takes effect. Any Owner. */
export async function rejectPayoutWallet(input: {
  merchantId: Buffer;
  walletId: Buffer;
  userId: number;
}) {
  await requireOwner(input.merchantId, input.userId);
  const row = await prisma.merchantPayoutWallet.findUnique({ where: { id: input.walletId } });
  if (!row || !Buffer.from(row.merchantId).equals(input.merchantId)) {
    throw new PayoutWalletError("Change not found.");
  }
  const updated = await prisma.merchantPayoutWallet.updateMany({
    where: { id: input.walletId, status: { in: ["proposed", "approved"] } },
    data: { status: "rejected", rejectedById: input.userId },
  });
  if (updated.count !== 1) throw new PayoutWalletError("This change is no longer open.");
  await recordMerchantAudit(input.merchantId, input.userId, "payout_wallet.rejected", {
    address: row.address,
  });
  await emailOwners(
    input.merchantId,
    "Payout wallet change stopped",
    `The payout wallet change to ${row.address} was rejected or cancelled. The current wallet stays in place.`
  );
}

/**
 * Applies approved changes whose 24 hours have passed. Run by the payments worker. The new
 * wallet becomes effective and the previous one is replaced in the same transaction.
 * Returns the merchants that changed, so AB-4 can send payout_wallet.changed.
 */
export async function applyDuePayoutWallets(now = new Date()): Promise<Buffer[]> {
  const due = await prisma.merchantPayoutWallet.findMany({
    where: { status: "approved", effectiveAt: { lte: now } },
    select: { id: true, merchantId: true, address: true },
    take: 20,
  });
  const changed: Buffer[] = [];
  for (const row of due) {
    const merchantId = Buffer.from(row.merchantId);
    const applied = await prisma.$transaction(async tx => {
      const claimed = await tx.merchantPayoutWallet.updateMany({
        where: { id: row.id, status: "approved" },
        data: { status: "effective" },
      });
      if (claimed.count !== 1) return false;
      await tx.merchantPayoutWallet.updateMany({
        where: { merchantId, status: "effective", NOT: { id: row.id } },
        data: { status: "replaced", replacedAt: now },
      });
      await recordMerchantAudit(
        merchantId,
        MERCHANT_SYSTEM_ACTOR,
        "payout_wallet.effective",
        { address: row.address },
        tx
      );
      return true;
    });
    if (applied) {
      changed.push(merchantId);
      await emailOwners(
        merchantId,
        "Payout wallet changed",
        `Sales now pay ${row.address}. Quotes signed before this change still pay the previous wallet.`
      );
    }
  }
  return changed;
}
