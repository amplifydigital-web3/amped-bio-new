import {
  CHECKOUT_MOCK_OUTCOMES,
  type CheckoutMockOutcome,
  type CheckoutProvider,
} from "@repo/constants";
import { trpcClient, type RouterOutputs } from "@repo/ui";

/**
 * Mobile checkout (docs/features/mobile-checkout.md 5, PR CK-2). The pay sheet talks to
 * a PaymentProvider. CK-2 ships the mock; CK-5 replaces it with AmpedPay (PAY-2) and
 * changes no screen.
 */

export type CheckoutQuote = RouterOutputs["checkout"]["quote"];

export type PayResult = { result: "paid" } | { result: "failed" };

export interface PaymentProvider {
  id: CheckoutProvider;
  /** A fresh quote. Called on every open and on every return to the tab. */
  quote(intentId: string): Promise<CheckoutQuote>;
  /** Signs and submits the payment for a quote, and resolves when it is known. */
  pay(intentId: string, quote: CheckoutQuote): Promise<PayResult>;
  /** Replaces the wallet balance for QA outcomes; null keeps the real one. */
  balanceOverride(): bigint | null;
  /** The amount the fan saw before, for the Price changed QA outcome; null when none. */
  seedLastSeen(quote: CheckoutQuote): string | null;
}

const CHECK_MS = 1_600;

/**
 * QA outcomes through ?mock= (paid, short, failed, price, paused, limit, seller,
 * removed). Read only on non production builds, so a production URL can never fake a
 * state.
 */
export function mockOutcome(search: string = window.location.search): CheckoutMockOutcome | null {
  if (import.meta.env.MODE === "production") return null;
  const value = new URLSearchParams(search).get("mock");
  return (CHECKOUT_MOCK_OUTCOMES as readonly string[]).includes(value ?? "")
    ? (value as CheckoutMockOutcome)
    : null;
}

/**
 * The mock provider. The quote is the server's (mock price, real fee, real pause, pilot
 * list and limits). Pay moves no USDC: it waits like a real check, then reports paid,
 * or failed for ?mock=failed. Nothing is granted.
 */
export function createMockProvider(
  outcome: CheckoutMockOutcome | null = mockOutcome()
): PaymentProvider {
  return {
    id: "mock",
    async quote(intentId) {
      const quote = await trpcClient.checkout.quote.query({ id: intentId });
      if (outcome === "paused" || outcome === "limit" || outcome === "seller") {
        return { ...quote, state: outcome };
      }
      if (outcome === "removed") return { ...quote, state: "removed", item: null };
      return quote;
    },
    async pay() {
      await new Promise(resolve => setTimeout(resolve, CHECK_MS));
      return outcome === "failed" ? { result: "failed" } : { result: "paid" };
    },
    balanceOverride() {
      return outcome === "short" ? 0n : null;
    },
    seedLastSeen(quote) {
      if (outcome !== "price") return null;
      const was = BigInt(quote.amount) - 1_000_000n;
      return (was > 0n ? was : 0n).toString();
    },
  };
}
