import { createPublicClient, http } from "viem";
import { getPaymentChain, getUsdcAddress, type PaymentChain } from "@repo/web3";

/**
 * The chain that carries USDC (docs/features/usdc-wallet-onramp.md 3.3).
 * VITE_PAYMENT_CHAIN is "base" in production and "base-sepolia" on staging.
 * Reads go through a public client on the chain's default RPC; the connected
 * wallet stays on Libertas and switches per action only when it signs.
 */
export const paymentChain: PaymentChain = getPaymentChain(import.meta.env.VITE_PAYMENT_CHAIN);

export const paymentChainUsdc = getUsdcAddress(paymentChain.id);

const createPaymentChainClient = () =>
  createPublicClient({ chain: paymentChain, transport: http() });

let client: ReturnType<typeof createPaymentChainClient> | null = null;

export function paymentChainClient() {
  if (!client) client = createPaymentChainClient();
  return client;
}

/** Explorer address link on the payment chain, when the chain lists one. */
export function paymentChainExplorerUrl(address: string): string | null {
  const explorer = paymentChain.blockExplorers?.default.url;
  return explorer ? `${explorer}/address/${address}` : null;
}
