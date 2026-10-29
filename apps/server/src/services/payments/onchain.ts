import { getAddress, isAddress, type Address, type Hex } from "viem";
import {
  AMPEDPAY_ABI,
  AMPEDPAY_ROLES,
  EIP1967_ADMIN_SLOT,
  EIP1967_IMPLEMENTATION_SLOT,
  PROXY_ADMIN_ABI,
  SAFE_ABI,
} from "@repo/web3";
import { env } from "../../env";
import { paymentClient } from "../usdc/chain";

/**
 * Live AmpedPay and Safe reads for the admin pages (Build Board #50, spec 3.2, 3.4, 3.8).
 * Every read is cached 30 seconds. A failed read returns null with the reason, and the
 * callers fall back to the deploy defaults so a slow RPC never blocks the portal.
 */

const CACHE_MS = 30_000;

export function configuredAddress(value: string): Address | null {
  return value && isAddress(value) ? getAddress(value) : null;
}

export function ampedPayAddress(): Address | null {
  return configuredAddress(env.AMPEDPAY_ADDRESS);
}

export function safeAddress(): Address | null {
  return configuredAddress(env.AMPEDPAY_SAFE);
}

export interface ContractState {
  address: Address;
  paused: boolean;
  feeFloorBps: number;
  minCreatorBps: number;
  maxRecipients: number;
  maxSplitValidity: number;
  minPayment: bigint;
  maxPayment: bigint;
  treasury: Address;
  splitSigner: Address;
  implementation: Address | null;
  proxyAdmin: Address | null;
  proxyAdminOwner: Address | null;
  /** Roles the environment's Safe holds (spec 6.1: admin, params and pauser) */
  safeRoles: { admin: boolean; params: boolean; pauser: boolean } | null;
  readAt: Date;
}

export interface SafeState {
  address: Address;
  owners: Address[];
  threshold: number;
  nonce: number;
  version: string | null;
  readAt: Date;
}

export type Read<T> = { ok: true; value: T } | { ok: false; reason: string };

/** The chain surface this module uses. Tests replace it. */
export interface PaymentsChain {
  contract(address: Address, safe: Address | null): Promise<ContractState>;
  safe(address: Address): Promise<SafeState>;
  hasRole(contract: Address, role: Hex, account: Address): Promise<boolean>;
}

function slotAddress(word: Hex | undefined): Address | null {
  if (!word || /^0x0*$/.test(word)) return null;
  return getAddress(`0x${word.slice(-40)}`);
}

const viemChain: PaymentsChain = {
  async contract(address, safe) {
    const client = paymentClient();
    const read = <N extends string>(functionName: N) =>
      ({ address, abi: AMPEDPAY_ABI, functionName }) as const;
    const [
      paused,
      feeFloorBps,
      minCreatorBps,
      maxRecipients,
      maxSplitValidity,
      minPayment,
      maxPayment,
      treasury,
      splitSigner,
    ] = await client.multicall({
      allowFailure: false,
      contracts: [
        read("paused"),
        read("feeFloorBps"),
        read("minCreatorBps"),
        read("maxRecipients"),
        read("maxSplitValidity"),
        read("minPayment"),
        read("maxPayment"),
        read("treasury"),
        read("splitSigner"),
      ],
    });
    const [implementationWord, adminWord] = await Promise.all([
      client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT }),
      client.getStorageAt({ address, slot: EIP1967_ADMIN_SLOT }),
    ]);
    const proxyAdmin = slotAddress(adminWord);
    const proxyAdminOwner = proxyAdmin
      ? await client
          .readContract({ address: proxyAdmin, abi: PROXY_ADMIN_ABI, functionName: "owner" })
          .catch(() => null)
      : null;
    const safeRoles = safe
      ? {
          admin: await this.hasRole(address, AMPEDPAY_ROLES.DEFAULT_ADMIN_ROLE, safe),
          params: await this.hasRole(address, AMPEDPAY_ROLES.PARAMS_ROLE, safe),
          pauser: await this.hasRole(address, AMPEDPAY_ROLES.PAUSER_ROLE, safe),
        }
      : null;
    return {
      address,
      paused: paused as boolean,
      feeFloorBps: Number(feeFloorBps),
      minCreatorBps: Number(minCreatorBps),
      maxRecipients: Number(maxRecipients),
      maxSplitValidity: Number(maxSplitValidity),
      minPayment: minPayment as bigint,
      maxPayment: maxPayment as bigint,
      treasury: getAddress(treasury as Address),
      splitSigner: getAddress(splitSigner as Address),
      implementation: slotAddress(implementationWord),
      proxyAdmin,
      proxyAdminOwner: proxyAdminOwner ? getAddress(proxyAdminOwner) : null,
      safeRoles,
      readAt: new Date(),
    };
  },

  async safe(address) {
    const client = paymentClient();
    const [owners, threshold, nonce] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address, abi: SAFE_ABI, functionName: "getOwners" },
        { address, abi: SAFE_ABI, functionName: "getThreshold" },
        { address, abi: SAFE_ABI, functionName: "nonce" },
      ],
    });
    const version = await client
      .readContract({ address, abi: SAFE_ABI, functionName: "VERSION" })
      .catch(() => null);
    return {
      address,
      owners: (owners as readonly Address[]).map(owner => getAddress(owner)),
      threshold: Number(threshold),
      nonce: Number(nonce),
      version,
      readAt: new Date(),
    };
  },

  hasRole(contract, role, account) {
    return paymentClient().readContract({
      address: contract,
      abi: AMPEDPAY_ABI,
      functionName: "hasRole",
      args: [role, account],
    });
  },
};

let chain: PaymentsChain = viemChain;

export function paymentsChain(): PaymentsChain {
  return chain;
}

const cache = new Map<string, { at: number; value: Read<unknown> }>();

/** Test seam. Clears the read cache too. */
export function setPaymentsChainForTests(next: PaymentsChain | null) {
  chain = next ?? viemChain;
  cache.clear();
}

export function clearOnchainCache() {
  cache.clear();
}

async function cached<T>(key: string, load: () => Promise<T>, now: number): Promise<Read<T>> {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.value as Read<T>;
  let value: Read<T>;
  try {
    value = { ok: true, value: await load() };
  } catch (error) {
    console.warn(`[payments] chain read ${key} failed`, error);
    value = {
      ok: false,
      reason: "The chain did not answer. Values shown are the deploy defaults.",
    };
  }
  cache.set(key, { at: now, value });
  return value;
}

/** AmpedPay's live values, or null when the contract address is not configured. */
export async function readContractState(now = Date.now()): Promise<Read<ContractState> | null> {
  const address = ampedPayAddress();
  if (!address) return null;
  return cached(`contract:${address}`, () => chain.contract(address, safeAddress()), now);
}

/** The environment's Safe, or null when its address is not configured. */
export async function readSafeState(now = Date.now()): Promise<Read<SafeState> | null> {
  const address = safeAddress();
  if (!address) return null;
  return cached(`safe:${address}`, () => chain.safe(address), now);
}

/**
 * Relayers allowed to submit (RELAYER_ROLE). AccessControl does not list members, so the
 * candidates are the CDP relayer and every address the change log added or removed; each
 * is checked on chain.
 */
export async function readRelayers(
  candidates: Address[],
  now = Date.now()
): Promise<Read<Address[]> | null> {
  const address = ampedPayAddress();
  if (!address) return null;
  const unique = [...new Set(candidates.map(candidate => getAddress(candidate)))].sort();
  return cached(
    `relayers:${address}:${unique.join(",")}`,
    async () => {
      const allowed: Address[] = [];
      for (const candidate of unique) {
        if (await chain.hasRole(address, AMPEDPAY_ROLES.RELAYER_ROLE, candidate)) {
          allowed.push(candidate);
        }
      }
      return allowed;
    },
    now
  );
}
