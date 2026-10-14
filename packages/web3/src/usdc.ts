import { type Address, formatUnits } from "viem";
import { base, baseSepolia } from "viem/chains";

/**
 * USDC in the wallet (Build Board #29, docs/features/usdc-wallet-onramp.md 3.3).
 * The payment chain carries Circle's native USDC beside the Libertas tREVO
 * wallet. The same wallet address holds both; only the chain differs.
 */
export const PAYMENT_CHAINS = { base, baseSepolia } as const;

export type PaymentChain = (typeof PAYMENT_CHAINS)[keyof typeof PAYMENT_CHAINS];

/** Circle's USDC contract per payment chain (developers.circle.com/stablecoins/usdc-contract-addresses). */
export const USDC_ADDRESSES: Record<number, Address> = {
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const USDC_SYMBOL = "USDC";
export const USDC_DECIMALS = 6;

/** The payment chain for a config value: "base" is production, anything else is Base Sepolia. */
export function getPaymentChain(name?: string | null): PaymentChain {
  return name === "base" ? base : baseSepolia;
}

export function getUsdcAddress(chainId: number): Address | null {
  return USDC_ADDRESSES[chainId] ?? null;
}

/** The ERC-20 surface the wallet reads. Signed transfers (EIP-3009) arrive with the send flow. */
export const USDC_READ_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/**
 * USDC shown as USD: two decimals, up to four in balances with trailing zeros
 * removed, digit grouping (spec decision 8).
 */
export function formatUsdc(units: bigint, maxDecimals: 2 | 4 = 2): string {
  const raw = formatUnits(units, USDC_DECIMALS);
  const [whole = "0", fraction = ""] = raw.split(".");
  let kept = fraction.slice(0, maxDecimals).padEnd(2, "0");
  // Beyond two places only significant digits stay (25.5 reads 25.50, 25.5012 stays)
  if (kept.length > 2) kept = kept.replace(/0+$/, "").padEnd(2, "0");
  return `${BigInt(whole).toLocaleString("en-US")}.${kept}`;
}
