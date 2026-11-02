import { prisma } from "@repo/database";
import { PAYMENTS_ADMIN_ROLE } from "@repo/constants";
import { safeAppUrl } from "@repo/web3";
import { env } from "../../env";
import { paymentChain } from "../usdc/chain";
import { relayerState } from "../usdc/admin";
import { listChanges } from "./changes";
import { accountState } from "./accounts";
import { ampedPayAddress, readContractState, readSafeState, safeAddress } from "./onchain";
import { safeMode } from "./safe";
import { contractLimits, limitsFromState, paymentSettings } from "./settings";

/**
 * Admin, Payments, Overview (board a1, spec 3.8). Status, changes waiting on approval, the
 * key values in force, and the contract, Safe and Coinbase accounts, read live from Base
 * with a 30 second cache. A failed read falls back to the deploy values and says so.
 */

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
    chainId: paymentChain.id,
    explorerUrl: paymentChain.blockExplorers?.default.url ?? null,
  };
}

export async function paymentsOverview(now = new Date()) {
  const [settings, waiting, relayer, contractRead, safeRead, splitSigner, pauser, proposer] =
    await Promise.all([
      paymentSettings(now.getTime()),
      listChanges({ filter: "waiting", limit: 20, now }),
      relayerState(),
      readContractState(now.getTime()),
      readSafeState(now.getTime()),
      accountState("splitSigner"),
      accountState("pauser"),
      accountState("proposer"),
    ]);
  const state = contractRead?.ok ? contractRead.value : null;
  const limits = state ? limitsFromState(state) : contractLimits();
  const contract = ampedPayAddress();
  const safe = safeAddress();
  const safeState = safeRead?.ok ? safeRead.value : null;
  const production = paymentChain.id === 8453;

  return {
    enabled: env.PAYMENTS_ENABLED,
    environment: production ? ("production" as const) : ("staging" as const),
    network: paymentChain.name,
    chainId: paymentChain.id,
    explorerUrl: paymentChain.blockExplorers?.default.url ?? null,
    paused: settings.paymentsPaused,
    contractPaused: state?.paused ?? false,
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
      // True when the values on this page came from the contract, false for deploy defaults
      chainReads: state !== null,
      readFailed: contractRead !== null && !contractRead.ok,
      paused: state?.paused ?? null,
      implementation: state?.implementation ?? null,
      proxyAdmin: state?.proxyAdmin ?? null,
      // The ProxyAdmin is owned by the Safe (spec 3.2). False flags a deploy to fix.
      upgradesBySafe: state?.proxyAdminOwner && safe ? state.proxyAdminOwner === safe : null,
      safeRoles: state?.safeRoles ?? null,
      readAt: state?.readAt.toISOString() ?? null,
    },
    safe: {
      address: safe,
      chainReads: safeState !== null,
      readFailed: safeRead !== null && !safeRead.ok,
      owners: safeState?.owners ?? [],
      threshold: safeState
        ? `${safeState.threshold} of ${safeState.owners.length}`
        : production
          ? "2 of 3"
          : "1 of 2",
      nonce: safeState?.nonce ?? null,
      version: safeState?.version ?? null,
      // service: proposals go to the Safe app queue; manual: an owner submits them
      proposals: safeMode(),
      url: safe ? safeAppUrl(paymentChain.id, safe) : null,
    },
    accounts: { relayer, splitSigner, pauser, proposer },
  };
}
