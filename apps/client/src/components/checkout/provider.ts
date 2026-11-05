import {
  CHECKOUT_MOCK_OUTCOMES,
  type CheckoutMockOutcome,
  type CheckoutProvider,
  type PurchaseRefusal,
} from "@repo/constants";
import { trpcClient, type RouterOutputs } from "@repo/ui";
import { classifyTxError } from "@/components/panels/explore/pool-panel/format";
import type { PaymentChainTypedData } from "@/components/panels/wallet/send/useUsdcSigner";

/**
 * Mobile checkout (docs/features/mobile-checkout.md 5, PRs CK-2 and CK-5). The pay sheet
 * talks to a PaymentProvider: the mock (CK-2) or AmpedPay (PAY-2, CK-5), chosen by the
 * quote's provider.
 */

export type CheckoutQuote = RouterOutputs["checkout"]["quote"];

export type PayResult =
  | { result: "paid" }
  | { result: "failed" }
  /** The fan cancelled in their wallet; nothing was sent */
  | { result: "rejected" }
  /** Sent, but not landed within the wait; the sheet keeps checking by intent */
  | { result: "pending" }
  | {
      result: "refused";
      reason: PurchaseRefusal;
      shortBy?: string;
      amount?: string;
      policyVersion?: number;
    };

export type PayOptions = {
  /** The live store policy version the fan accepted after it changed (CK-5) */
  policyVersion?: number;
};

export interface PaymentProvider {
  id: CheckoutProvider;
  /** A fresh quote. Called on every open and on every return to the tab. */
  quote(intentId: string): Promise<CheckoutQuote>;
  /** Signs and submits the payment for a quote, and resolves when it is known. */
  pay(intentId: string, quote: CheckoutQuote, options?: PayOptions): Promise<PayResult>;
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

/** Signs typed data with the account the server names (usePaymentChainSigner). */
export type TypedDataSigner = (typed: PaymentChainTypedData) => Promise<`0x${string}`>;

const STATUS_POLL_MS = 2_000;
const STATUS_POLLS = 15;

type PurchaseStatusOut = RouterOutputs["payments"]["status"];

/** What a purchase status means for the sheet; null while it is still on its way. */
export function resultOfStatus(status: PurchaseStatusOut["status"]): PayResult | null {
  if (status === "confirmed_soft" || status === "confirmed") return { result: "paid" };
  if (status === "failed" || status === "expired" || status === "refunded") {
    return { result: "failed" };
  }
  return null;
}

async function awaitPurchase(purchaseId: string, wait: (ms: number) => Promise<void>) {
  for (let i = 0; i < STATUS_POLLS; i++) {
    const status = await trpcClient.payments.status.query({ purchaseId });
    const result = resultOfStatus(status.status);
    if (result) return result;
    await wait(STATUS_POLL_MS);
  }
  return { result: "pending" } as const;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * AmpedPay (PAY-2, CK-5). Pay asks the server to prepare: it checks the price, the pause, the
 * seller, the limits, the balance, screening and the store policy, and signs the split. The
 * fan signs one USDC ReceiveWithAuthorization to AmpedPay with the account the server names.
 * The server relays it and waits for the first confirmation (unlock, mobile checkout D4).
 */
export function createAmpedPayProvider({
  sign,
  signer,
  wait = sleep,
}: {
  sign: TypedDataSigner;
  /** The live wallet; the server refuses a different one before anything is signed */
  signer: string | undefined;
  wait?: (ms: number) => Promise<void>;
}): PaymentProvider {
  return {
    id: "ampedpay",
    quote: intentId => trpcClient.checkout.quote.query({ id: intentId }),
    async pay(intentId, quote, options = {}) {
      const prepared = await trpcClient.payments.pay.prepare.mutate({
        intentId,
        amount: quote.amount,
        signer,
        policyVersion: options.policyVersion,
      });
      if (prepared.refused) {
        if (prepared.reason === "owned") return { result: "paid" };
        if (prepared.reason === "in_progress" && prepared.purchaseId) {
          return awaitPurchase(prepared.purchaseId, wait);
        }
        return {
          result: "refused",
          reason: prepared.reason,
          shortBy: prepared.shortBy,
          amount: prepared.amount,
          policyVersion: prepared.policyVersion,
        };
      }

      const { domain, message } = prepared.typedData;
      let signature: `0x${string}`;
      try {
        signature = await sign({
          account: prepared.review.payer,
          domain: {
            name: domain.name,
            version: domain.version,
            chainId: Number(domain.chainId),
            verifyingContract: domain.verifyingContract,
          },
          types: prepared.typedData.types,
          primaryType: "ReceiveWithAuthorization",
          message: {
            from: message.from,
            to: message.to,
            value: BigInt(message.value),
            validAfter: BigInt(message.validAfter),
            validBefore: BigInt(message.validBefore),
            nonce: message.nonce,
          },
        });
      } catch (error) {
        return classifyTxError(error) === "rejected"
          ? { result: "rejected" }
          : { result: "failed" };
      }

      const sent = await trpcClient.payments.pay.submit.mutate({
        purchaseId: prepared.purchaseId,
        signature,
      });
      if (sent.refused) {
        return {
          result: "refused",
          reason: sent.reason,
          shortBy: sent.shortBy,
          amount: sent.amount,
          policyVersion: sent.policyVersion,
        };
      }
      return resultOfStatus(sent.status) ?? awaitPurchase(sent.purchaseId, wait);
    },
    balanceOverride: () => null,
    seedLastSeen: () => null,
  };
}
