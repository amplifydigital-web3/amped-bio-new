/**
 * Which payment provider the pay sheet runs on (Build Board #49, PR CK-2).
 *
 * CK-5: AmpedPay (PAY-2) whenever it is deployed and its accounts are configured
 * (`paymentsReady`). Otherwise the mock, which charges nothing and grants nothing, yet the
 * sheet still says "You paid". A safety rail, independent of the checkout feature flag, keeps
 * the mock out of production: on the production app environment or on a mainnet payment
 * chain it is refused, so a missing AmpedPay setting cannot fake a purchase.
 */
import { TRPCError } from "@trpc/server";
import type { CheckoutProvider } from "@repo/constants";
import { env } from "../../env";
import { paymentChain } from "../usdc/chain";
import { paymentsReady } from "../payments/ready";

export type ProviderEnvironment = { appEnv: string; testnetChain: boolean; ampedPay: boolean };

/** The mock provider is allowed only outside production and on a test chain. */
export function mockProviderAllowed({ appEnv, testnetChain }: ProviderEnvironment): boolean {
  return appEnv !== "production" && testnetChain;
}

export function currentProviderEnvironment(): ProviderEnvironment {
  return {
    appEnv: env.APP_ENV,
    testnetChain: paymentChain.testnet === true,
    ampedPay: paymentsReady(),
  };
}

/**
 * The provider for a quote: AmpedPay when ready. Throws PRECONDITION_FAILED where only the
 * mock exists but the mock is not allowed, so the sheet shows an error instead of a fake
 * payment.
 */
export function checkoutProvider(
  environment: ProviderEnvironment = currentProviderEnvironment()
): CheckoutProvider {
  if (environment.ampedPay) return "ampedpay";
  if (!mockProviderAllowed(environment)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Checkout is not available yet.",
    });
  }
  return "mock";
}
