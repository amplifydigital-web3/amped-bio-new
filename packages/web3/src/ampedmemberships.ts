import { bytesToHex, keccak256, pad, stringToBytes, type Address, type Hex } from "viem";

export { AMPEDMEMBERSHIPS_ABI } from "./abis/ampedmemberships";

/** The contract's EIP-712 domain: name AmpedMemberships, version 1 (fixed at deploy). */
export function ampedMembershipsDomain(chainId: number, verifyingContract: Address) {
  return { name: "AmpedMemberships", version: "1", chainId, verifyingContract } as const;
}

/** EIP-712 types of a join table. Field order matches JOIN_TYPEHASH in AmpedMemberships.sol. */
export const JOIN_TABLE_TYPES = {
  JoinTable: [
    { name: "subscriptionRef", type: "bytes32" },
    { name: "planRef", type: "bytes32" },
    { name: "member", type: "address" },
    { name: "price", type: "uint256" },
    { name: "periodSeconds", type: "uint32" },
    { name: "recipients", type: "Recipient[]" },
    { name: "validBefore", type: "uint64" },
  ],
  Recipient: [
    { name: "to", type: "address" },
    { name: "bps", type: "uint16" },
    { name: "role", type: "uint8" },
  ],
} as const;

/** EIP-712 types of a member's Cancel. Matches CANCEL_TYPEHASH. */
export const MEMBERSHIP_CANCEL_TYPES = {
  Cancel: [
    { name: "subscriptionRef", type: "bytes32" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

/** Why a subscription ended, from Canceled.endedBy. */
export const MEMBERSHIP_END_BY = { member: 0, memberSignature: 1, platform: 2 } as const;

/** The on chain ref of a Membership: its 16 byte id, left padded to 32 bytes. */
export function membershipRef(id: Uint8Array | string): Hex {
  const hex: Hex = typeof id === "string" ? `0x${id.replace(/^0x/, "")}` : bytesToHex(id);
  return pad(hex, { size: 32 });
}

/** The Membership id (32 hex characters) inside a subscriptionRef, or null for a foreign one. */
export function membershipIdFromRef(ref: Hex): string | null {
  const hex = ref.toLowerCase().replace(/^0x/, "");
  if (hex.length !== 64 || !hex.startsWith("0".repeat(32))) return null;
  return hex.slice(32);
}

/**
 * The on chain ref of a plan version. A new amount makes a new version, so existing members
 * keep the terms they joined with ("New amounts apply to new members only").
 */
export function planRef(planIdHex: string, version: number): Hex {
  return keccak256(stringToBytes(`amped-plan:${planIdHex}:${version}`));
}
