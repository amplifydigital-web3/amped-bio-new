import { getAddress, isAddress } from "viem";
import { prisma } from "@repo/database";
import { PAYMENTS_ADMIN_ROLE } from "@repo/constants";
import { env } from "../../env";
import { paymentChain } from "../usdc/chain";
import { relayerState } from "../usdc/admin";
import { listChanges } from "./changes";
import { contractLimits, paymentSettings } from "./settings";

/**
 * Admin, Payments, Overview (board a1, spec 3.8). Status, changes waiting on approval, the
 * key values in force, and the contract, Safe and Coinbase accounts. Chain reads of the
 * contract and the Safe arrive with PAY-A2; until then they read from the deploy values.
 */

function address(value: string): string | null {
  return value && isAddress(value) ? getAddress(value) : null;
}

export function hasPaymentsAdminRole(role: string | null | undefined): boolean {
  return (role ?? "")
    .split(",")
    .map(entry => entry.trim())
    .includes(PAYMENTS_ADMIN_ROLE);
}

/** What the signed in admin can do on the Payments pages. */
export async function paymentsViewer(userId: number, role: string) {
  const twoFactor = await prisma.twoFactor.findUnique({
    where: { userId },
    select: { verified: true },
  });
  return {
    userId,
    canChange: hasPaymentsAdminRole(role),
    twoFactorOn: !!twoFactor && twoFactor.verified !== false,
  };
}

export async function paymentsOverview(now = new Date()) {
  const [settings, waiting, relayer] = await Promise.all([
    paymentSettings(now.getTime()),
    listChanges({ filter: "waiting", limit: 20, now }),
    relayerState(),
  ]);
  const limits = contractLimits();
  const contract = address(env.AMPEDPAY_ADDRESS);
  const safe = address(env.AMPEDPAY_SAFE);
  const production = paymentChain.id === 8453;

  return {
    enabled: env.PAYMENTS_ENABLED,
    environment: production ? ("production" as const) : ("staging" as const),
    network: paymentChain.name,
    chainId: paymentChain.id,
    explorerUrl: paymentChain.blockExplorers?.default.url ?? null,
    paused: settings.paymentsPaused,
    waiting: waiting.items,
    settings: {
      platformFeeBps: settings.platformFeeBps,
      feeFloorBps: limits.feeFloorBps,
      minCreatorBps: limits.minCreatorBps,
      oneTimePriceMin: settings.oneTimePriceMin.toString(),
      oneTimePriceMax: settings.oneTimePriceMax.toString(),
      minPayment: limits.minPayment.toString(),
      maxPayment: limits.maxPayment.toString(),
      purchasesPerDayPerAccount: settings.purchasesPerDayPerAccount,
      purchaseUsdcPerDayPerAccount: settings.purchaseUsdcPerDayPerAccount.toString(),
      quoteWindowSeconds: settings.quoteWindowSeconds,
      promoterShareMinBps: settings.promoterShareMinBps,
      promoterShareMaxBps: settings.promoterShareMaxBps,
      refundWindowDays: settings.refundWindowDays,
      promoterRefundPauseRateBps: settings.promoterRefundPauseRateBps,
      pilotOnly: settings.pilotOnly,
      pilotCreators: settings.pilotCreators.length,
    },
    contract: {
      deployed: contract !== null,
      address: contract,
      // Read from Base with PAY-A2: version, ProxyAdmin owner and the contract pause
      chainReads: false,
    },
    safe: {
      address: safe,
      // Owners and threshold are read from the Safe with PAY-A2 (decision 3)
      threshold: production ? "2 of 3" : "1 of 2",
      chainReads: false,
    },
    accounts: {
      relayer,
      // Created in the CDP Portal (Build Board #53, B3); read with PAY-A2 and PAY-2
      splitSigner: null,
      pauser: null,
      proposer: null,
    },
  };
}
