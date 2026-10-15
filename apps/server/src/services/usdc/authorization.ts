import { randomBytes } from "node:crypto";
import {
  getAddress,
  isAddressEqual,
  parseSignature,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from "@repo/web3";
import type { UsdcDomain } from "./chain";

/**
 * EIP-3009 TransferWithAuthorization (spec 3.4). The server builds the typed
 * data, the fan signs it in the Web3Auth wallet, and the relayer submits it.
 * Values travel as decimal strings so the payload survives JSON.
 */
export type TransferAuthorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

/** 32 random bytes, unique per authorizer (the contract refuses a reused nonce). */
export function newAuthorizationNonce(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function buildTransferAuthorization(params: {
  from: Address;
  to: Address;
  value: bigint;
  now: Date;
  ttlSeconds: number;
  nonce?: Hex;
}): TransferAuthorization {
  const nowSeconds = BigInt(Math.floor(params.now.getTime() / 1000));
  return {
    from: getAddress(params.from),
    to: getAddress(params.to),
    value: params.value,
    validAfter: 0n,
    validBefore: nowSeconds + BigInt(params.ttlSeconds),
    nonce: params.nonce ?? newAuthorizationNonce(),
  };
}

/** The JSON safe typed data the client passes to signTypedData. */
export function toTypedDataPayload(domain: UsdcDomain, auth: TransferAuthorization) {
  return {
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: auth.from,
      to: auth.to,
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
      nonce: auth.nonce,
    },
  };
}

export type TypedDataPayload = ReturnType<typeof toTypedDataPayload>;

/**
 * True when the signature recovers to the authorizer. Checked before the
 * relayer spends gas on a transaction the contract would revert.
 */
export async function isSignedBy(
  domain: UsdcDomain,
  auth: TransferAuthorization,
  signature: Hex
): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: auth,
      signature,
    });
    return isAddressEqual(signer, auth.from);
  } catch {
    return false;
  }
}

/** v, r and s for transferWithAuthorization. Accepts 65 byte and EIP-2098 compact signatures. */
export function splitAuthorizationSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  const parsed = parseSignature(signature);
  const raw = parsed.v !== undefined ? Number(parsed.v) : (parsed.yParity ?? 0);
  // Some wallets return v as 0 or 1; the contract's ecrecover wants 27 or 28
  const v = raw < 27 ? raw + 27 : raw;
  return { v, r: parsed.r, s: parsed.s };
}
