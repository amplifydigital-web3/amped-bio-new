import { TRPCError } from "@trpc/server";
import { createPublicClient, isAddress, type Address, type PublicClient } from "viem";
import {
  BASE_REGISTRAR_ABI,
  RESOLVER_ABI,
  RNS_BINDING_MESSAGES,
  RNS_CHAIN,
  checkRnsLabel,
  formatRnsName,
  getRpcTransport,
  isRnsNameActive,
  parseRnsInput,
  rnsNode,
  rnsTokenId,
} from "@repo/web3";
import { cache } from "../utils/cache";

/**
 * Revolution Name Service (RNS) on the server: one binding rule that every
 * surface trusts (Screen Review 100 I02 to I04).
 *
 * A name is bound to a wallet only when all of these hold:
 * - the registration expiry is in the future (the grace period does not count),
 * - the BaseRegistrar owner of the name is the wallet,
 * - the resolver addr record of the name is the wallet.
 * Without a wallet nothing is bound. Every failure fails closed.
 */

export type RnsNameRecord = {
  /** Registration expiry in seconds, 0 when the name was never registered. */
  expiry: number;
  /** BaseRegistrar owner. null when the call reverts (expired or never registered). */
  owner: Address | null;
  /** Resolver addr(node). null when unset or the read failed. */
  addr: Address | null;
};

export type RnsNameReader = (label: string) => Promise<RnsNameRecord>;

export type RnsBindingFailure =
  | "no_wallet"
  | "invalid"
  | "not_found"
  | "expired"
  | "not_owner"
  | "addr_elsewhere";

export type RnsBindingResult =
  | { ok: true; label: string; name: string; expiry: number }
  | { ok: false; reason: RnsBindingFailure; label: string | null; expiry: number | null };

export { RNS_BINDING_MESSAGES };

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BINDING_CACHE_TTL_SECONDS = 60;

let client: PublicClient | null = null;

function rnsClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: RNS_CHAIN,
      transport: getRpcTransport(RNS_CHAIN, { timeout: 5_000 }),
    }) as PublicClient;
  }
  return client;
}

const sameAddress = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Reads expiry, owner and resolver addr of a label in one multicall. */
export const readRnsNameOnChain: RnsNameReader = async label => {
  const tokenId = rnsTokenId(label);
  const { BASE_REGISTRAR, L2_RESOLVER } = RNS_CHAIN.contracts;
  const [expiry, owner, addr] = await rnsClient().multicall({
    allowFailure: true,
    contracts: [
      {
        address: BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "nameExpires",
        args: [tokenId],
      },
      {
        address: BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [tokenId],
      },
      {
        address: L2_RESOLVER.address,
        abi: RESOLVER_ABI,
        functionName: "addr",
        args: [rnsNode(label, RNS_CHAIN.id)],
      },
    ],
  });

  // The expiry read is required. Without it the rule cannot be checked.
  if (expiry.status !== "success") {
    throw new Error(`RNS expiry read failed for ${label}: ${String(expiry.error)}`);
  }

  const toAddress = (value: unknown): Address | null =>
    typeof value === "string" && isAddress(value) && value !== ZERO_ADDRESS
      ? (value as Address)
      : null;

  return {
    expiry: Number(expiry.result as bigint),
    owner: owner.status === "success" ? toAddress(owner.result) : null,
    addr: addr.status === "success" ? toAddress(addr.result) : null,
  };
};

/**
 * Applies the binding rule. Never throws for a rule failure; a failed chain
 * read throws so callers can decide (the save path fails closed, the public
 * read path shows no name).
 */
export async function checkRnsBinding(
  name: string | null | undefined,
  wallet: string | null | undefined,
  read: RnsNameReader = readRnsNameOnChain,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<RnsBindingResult> {
  const label = name ? parseRnsInput(name, RNS_CHAIN.id) : "";
  if (!wallet) return { ok: false, reason: "no_wallet", label: label || null, expiry: null };
  if (!label || checkRnsLabel(label)) {
    return { ok: false, reason: "invalid", label: label || null, expiry: null };
  }

  const record = await read(label);
  if (!record.expiry) return { ok: false, reason: "not_found", label, expiry: null };
  if (!isRnsNameActive(record.expiry, nowSeconds)) {
    return { ok: false, reason: "expired", label, expiry: record.expiry };
  }
  if (!sameAddress(record.owner, wallet)) {
    return { ok: false, reason: "not_owner", label, expiry: record.expiry };
  }
  if (!sameAddress(record.addr, wallet)) {
    return { ok: false, reason: "addr_elsewhere", label, expiry: record.expiry };
  }
  return { ok: true, label, name: formatRnsName(label, RNS_CHAIN.id), expiry: record.expiry };
}

/** checkRnsBinding with a short cache, for the public page read path. */
export async function checkRnsBindingCached(
  name: string | null | undefined,
  wallet: string | null | undefined
): Promise<RnsBindingResult> {
  if (!name || !wallet) return checkRnsBinding(name, wallet);
  const key = `rns_binding:${RNS_CHAIN.id}:${parseRnsInput(name, RNS_CHAIN.id)}:${wallet.toLowerCase()}`;
  const hit = await cache.get<RnsBindingResult>(key);
  if (hit) return hit;
  const result = await checkRnsBinding(name, wallet);
  await cache.set(key, result, BINDING_CACHE_TTL_SECONDS);
  return result;
}

/**
 * The save path (user.edit): returns the canonical name to store, or throws
 * BAD_REQUEST with the words the person sees. A failed chain read also refuses
 * the save (fails closed).
 */
export async function assertRnsBinding(
  name: string,
  wallet: string | null | undefined,
  read: RnsNameReader = readRnsNameOnChain
): Promise<string> {
  if (!wallet) {
    throw new TRPCError({ code: "BAD_REQUEST", message: RNS_BINDING_MESSAGES.no_wallet });
  }
  let result: RnsBindingResult;
  try {
    result = await checkRnsBinding(name, wallet, read);
  } catch (error) {
    console.warn("[rns] binding read failed, refusing the save:", error);
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: RNS_BINDING_MESSAGES.unavailable,
    });
  }
  if (!result.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: RNS_BINDING_MESSAGES.not_linked });
  }
  return result.name;
}
