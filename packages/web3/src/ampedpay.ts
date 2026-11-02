import { type Hex, keccak256, stringToHex, toHex } from "viem";
import { base, baseSepolia } from "viem/chains";

export { AMPEDPAY_ABI } from "./abis/ampedpay";

/**
 * AmpedPay admin on chain (Build Board #50, docs/features/ampedpay.md 3.2 and 3.6). The
 * contract sits behind a transparent proxy whose ProxyAdmin the environment's Safe owns.
 * Parameter changes are Safe transactions; the portal proposes them as a Safe delegate.
 */

/** Role ids as the contract computes them: keccak256 of the role name. DEFAULT_ADMIN_ROLE is 0. */
export const AMPEDPAY_ROLES = {
  DEFAULT_ADMIN_ROLE: toHex(0, { size: 32 }),
  PARAMS_ROLE: keccak256(stringToHex("PARAMS_ROLE")),
  PAUSER_ROLE: keccak256(stringToHex("PAUSER_ROLE")),
  RELAYER_ROLE: keccak256(stringToHex("RELAYER_ROLE")),
} as const;

/**
 * The bytes32 name ParamChanged carries. Solidity converts the string literal to bytes32
 * left aligned and zero padded, so "feeFloorBps" reads back the same way.
 */
export function ampedPayParamName(name: string): Hex {
  return stringToHex(name, { size: 32 });
}

/** EIP-1967 storage slots on the transparent proxy. */
export const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
export const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

/** OpenZeppelin ProxyAdmin: the Safe owns it, so upgrades need the owners. */
export const PROXY_ADMIN_ABI = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** The Safe surface the portal reads (Safe v1.3 and later). */
export const SAFE_ABI = [
  {
    type: "function",
    name: "nonce",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** EIP-712 types of a Safe transaction (Safe v1.3 and later; the domain is chainId and the Safe). */
export const SAFE_TX_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/** Network short names the Safe app and the Transaction Service use (EIP-3770). */
export const SAFE_NETWORK_SHORT_NAMES: Record<number, string> = {
  [base.id]: "base",
  [baseSepolia.id]: "basesep",
};

/** Safe's hosted Transaction Service. It needs an API key from developer.safe.global. */
export const SAFE_TX_SERVICE_BASE = "https://api.safe.global/tx-service";

export function safeTxServiceUrl(chainId: number): string | null {
  const shortName = SAFE_NETWORK_SHORT_NAMES[chainId];
  return shortName ? `${SAFE_TX_SERVICE_BASE}/${shortName}/api` : null;
}

/** The Safe app page for one Safe, or one of its transactions. */
export function safeAppUrl(chainId: number, safe: string, safeTxHash?: string | null): string {
  const id = `${SAFE_NETWORK_SHORT_NAMES[chainId] ?? "basesep"}:${safe}`;
  return safeTxHash
    ? `https://app.safe.global/transactions/tx?safe=${id}&id=multisig_${safe}_${safeTxHash}`
    : `https://app.safe.global/home?safe=${id}`;
}
