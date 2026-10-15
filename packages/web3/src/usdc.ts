import { type Address, formatUnits, parseUnits } from "viem";
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

/** The ERC-20 surface the wallet reads. */
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
 * The FiatToken v2.2 surface a gasless send uses (spec 3.4). The fan signs an
 * EIP-3009 TransferWithAuthorization; the relayer submits it and pays gas.
 */
export const USDC_EIP3009_ABI = [
  ...USDC_READ_ABI,
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** EIP-712 types for an EIP-3009 transfer authorization. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * The EIP-712 domain name Circle deployed on each chain. The server reads
 * name() and version() from the contract and uses these only as the fallback.
 */
export const USDC_EIP712_FALLBACK: Record<number, { name: string; version: string }> = {
  [base.id]: { name: "USD Coin", version: "2" },
  [baseSepolia.id]: { name: "USDC", version: "2" },
};

/**
 * A typed USDC amount to base units. Accepts plain decimals with up to six
 * places. Returns null for anything else, including zero or negative values.
 */
export function parseUsdc(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  const units = parseUnits(trimmed, USDC_DECIMALS);
  return units > 0n ? units : null;
}

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
