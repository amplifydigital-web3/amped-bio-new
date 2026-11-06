import { getAddress, isAddress, type Address } from "viem";
import { prisma } from "@repo/database";
import { AMPEDPAY_CONTRACT, type MerchantFailReason } from "@repo/constants";
import { ScreeningUnavailableError, screenAddress } from "../usdc/screen";

/**
 * The seller gate for a business seller (docs/features/authbase-storefront.md 3.2, M1).
 *
 * A merchant sells only when it is active (approved by two admins after the business check),
 * it has an effective payout wallet, the wallet passes the USDC screen, and its fee sits inside
 * the contract's merchant ceiling. checkMerchant replaces checkIdentity(seller) for an offer a
 * merchant sells: the personal check cannot verify a company or a Safe.
 *
 * Never throws and fails closed: an unreadable database or an unavailable screen refuses the
 * sale with "unavailable", the same as a seller that does not pass.
 */

export type MerchantCheckResult =
  | { pass: true; merchantId: Buffer; name: string; payoutWallet: Address; feeBps: number }
  | { pass: false; reason: MerchantFailReason };

export async function effectivePayoutWallet(merchantId: Uint8Array): Promise<Address | null> {
  const row = await prisma.merchantPayoutWallet.findFirst({
    where: { merchantId: Buffer.from(merchantId), status: "effective" },
    orderBy: { effectiveAt: "desc" },
    select: { address: true },
  });
  if (!row || !isAddress(row.address, { strict: false })) return null;
  return getAddress(row.address);
}

export async function checkMerchant(
  merchantId: Uint8Array,
  options: { screen?: boolean } = {}
): Promise<MerchantCheckResult> {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: Buffer.from(merchantId) },
      select: { id: true, name: true, status: true, feeBps: true },
    });
    if (!merchant) return { pass: false, reason: "not_found" };
    if (merchant.status !== "active") return { pass: false, reason: "not_active" };
    if (
      merchant.feeBps < AMPEDPAY_CONTRACT.defaults.feeFloorBps ||
      merchant.feeBps > AMPEDPAY_CONTRACT.MAX_MERCHANT_FEE_BPS
    ) {
      return { pass: false, reason: "fee_out_of_range" };
    }
    const payoutWallet = await effectivePayoutWallet(merchant.id);
    if (!payoutWallet) return { pass: false, reason: "no_payout_wallet" };
    if (options.screen !== false) {
      const screened = await screenAddress(payoutWallet, "send_destination", null);
      if (!screened.allowed) return { pass: false, reason: "screening" };
    }
    return {
      pass: true,
      merchantId: Buffer.from(merchant.id),
      name: merchant.name,
      payoutWallet,
      feeBps: merchant.feeBps,
    };
  } catch (error) {
    if (!(error instanceof ScreeningUnavailableError)) {
      console.error("[merchants] checkMerchant failed closed", error);
    }
    return { pass: false, reason: "unavailable" };
  }
}
