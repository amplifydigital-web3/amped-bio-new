import { createPublicClient, http, type Address } from "viem";
import {
  USDC_EIP3009_ABI,
  USDC_EIP712_FALLBACK,
  getPaymentChain,
  getUsdcAddress,
  type PaymentChain,
} from "@repo/web3";
import { env } from "../../env";

/**
 * USDC in the wallet (Build Board #29), spec 3.4. The payment chain (Base in
 * production, Base Sepolia elsewhere) and Circle's USDC contract on it.
 */
export const paymentChain: PaymentChain = getPaymentChain(env.PAYMENT_CHAIN);

export function usdcAddress(): Address {
  const address = getUsdcAddress(paymentChain.id);
  if (!address) throw new Error(`No USDC contract for chain ${paymentChain.id}`);
  return address;
}

/** CDP network name for the payment chain. */
export function cdpNetwork(): "base" | "base-sepolia" {
  return paymentChain.id === 8453 ? "base" : "base-sepolia";
}

const createClient = () =>
  createPublicClient({
    chain: paymentChain,
    transport: http(env.BASE_RPC_URL || undefined),
  });

let client: ReturnType<typeof createClient> | null = null;

export function paymentClient() {
  if (!client) client = createClient();
  return client;
}

/** Test seam. */
export function setPaymentClientForTests(next: ReturnType<typeof createClient> | null) {
  client = next;
  domain = null;
}

export type UsdcDomain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
};

let domain: UsdcDomain | null = null;

/**
 * The EIP-712 domain of the USDC contract, read once from name() and
 * version(). Circle named the token differently per chain ("USD Coin" on
 * Base, "USDC" on Base Sepolia), so the contract is the source of truth and
 * the static table is only the fallback when the read fails.
 */
export async function usdcDomain(): Promise<UsdcDomain> {
  if (domain) return domain;
  const verifyingContract = usdcAddress();
  const fallback = USDC_EIP712_FALLBACK[paymentChain.id] ?? { name: "USD Coin", version: "2" };
  try {
    const [name, version] = await Promise.all([
      paymentClient().readContract({
        address: verifyingContract,
        abi: USDC_EIP3009_ABI,
        functionName: "name",
      }),
      paymentClient().readContract({
        address: verifyingContract,
        abi: USDC_EIP3009_ABI,
        functionName: "version",
      }),
    ]);
    domain = { name, version, chainId: paymentChain.id, verifyingContract };
  } catch (error) {
    console.warn("[usdc] could not read the USDC EIP-712 domain, using the fallback", error);
    return { ...fallback, chainId: paymentChain.id, verifyingContract };
  }
  return domain;
}

export async function getUsdcBalance(address: Address): Promise<bigint> {
  return paymentClient().readContract({
    address: usdcAddress(),
    abi: USDC_EIP3009_ABI,
    functionName: "balanceOf",
    args: [address],
  });
}
