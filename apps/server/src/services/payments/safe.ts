import { getAddress, hashTypedData, zeroAddress, type Address, type Hex } from "viem";
import { SAFE_TX_TYPES, safeTxServiceUrl } from "@repo/web3";
import { env } from "../../env";
import { paymentChain } from "../usdc/chain";
import { accountAddress, isAccountConfigured, paymentsCdp } from "./accounts";
import type { ContractCall } from "./contractChanges";
import { paymentsChain, safeAddress } from "./onchain";

/**
 * Safe proposals (spec 3.6, decision 5). After the second payments_admin approves an on
 * chain change, the server builds the Safe transaction and proposes it to the Safe
 * Transaction Service as a delegate. Owners confirm and execute in the Safe app. The portal
 * never holds an owner key.
 *
 * Without a Safe API key or a proposer account the change still records the Safe
 * transaction (target, calldata, nonce, hash) and the portal shows it for an owner to
 * submit in the Safe app (spec 6.1 fallback). The indexer marks it applied either way.
 */

export class SafeProposalError extends Error {}

export interface SafeTx {
  to: Address;
  value: string;
  data: Hex;
  operation: 0;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: Address;
  refundReceiver: Address;
  nonce: number;
}

export function buildSafeTx(call: Pick<ContractCall, "to" | "data">, nonce: number): SafeTx {
  return {
    to: getAddress(call.to),
    value: "0",
    data: call.data,
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: zeroAddress,
    refundReceiver: zeroAddress,
    nonce,
  };
}

function typedData(chainId: number, safe: Address, tx: SafeTx) {
  return {
    domain: { chainId, verifyingContract: safe },
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx" as const,
    message: {
      to: tx.to,
      value: BigInt(tx.value),
      data: tx.data,
      operation: tx.operation,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken,
      refundReceiver: tx.refundReceiver,
      nonce: BigInt(tx.nonce),
    },
  };
}

/** The hash owners confirm (Safe v1.3 and later EIP-712 domain: chainId and the Safe). */
export function safeTxHash(chainId: number, safe: Address, tx: SafeTx): Hex {
  return hashTypedData(typedData(chainId, safe, tx));
}

export type SafeMode = "service" | "manual";

/** Service when the API key and the proposer exist; manual (owner submits) otherwise. */
export function safeMode(): SafeMode {
  return env.SAFE_API_KEY && isAccountConfigured("proposer") ? "service" : "manual";
}

export interface SafeTxStatus {
  confirmations: number;
  required: number;
  executed: boolean;
  successful: boolean | null;
  transactionHash: string | null;
  nonce: number;
}

/** The Transaction Service calls the portal makes. Tests replace it. */
export interface SafeService {
  pendingNonces(safe: Address, fromNonce: number): Promise<number[]>;
  propose(input: {
    safe: Address;
    tx: SafeTx;
    safeTxHash: Hex;
    sender: Address;
    signature: Hex;
  }): Promise<void>;
  transaction(safeTxHash: string): Promise<SafeTxStatus | null>;
}

function serviceBase(): string {
  const url = env.SAFE_TX_SERVICE_URL || safeTxServiceUrl(paymentChain.id);
  if (!url) throw new SafeProposalError("No Safe Transaction Service for this network.");
  return url.replace(/\/$/, "");
}

async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${serviceBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SAFE_API_KEY}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

const httpService: SafeService = {
  async pendingNonces(safe, fromNonce) {
    const response = await serviceFetch(
      `/v2/safes/${safe}/multisig-transactions/?executed=false&nonce__gte=${fromNonce}&limit=100`
    );
    if (!response.ok) throw new SafeProposalError(`Safe service answered ${response.status}`);
    const body = (await response.json()) as { results?: { nonce: number | string }[] };
    return (body.results ?? []).map(tx => Number(tx.nonce));
  },

  async propose({ safe, tx, safeTxHash: hash, sender, signature }) {
    const response = await serviceFetch(`/v2/safes/${safe}/multisig-transactions/`, {
      method: "POST",
      body: JSON.stringify({
        ...tx,
        contractTransactionHash: hash,
        sender,
        signature,
        origin: "Amped.Bio admin",
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[payments] Safe service refused the proposal", response.status, text);
      throw new SafeProposalError(
        response.status === 422 || response.status === 400
          ? "The Safe service refused the proposal. Check that the proposer is a delegate of the Safe."
          : `The Safe service answered ${response.status}.`
      );
    }
  },

  async transaction(hash) {
    const response = await serviceFetch(`/v2/multisig-transactions/${hash}/`);
    if (response.status === 404) return null;
    if (!response.ok) throw new SafeProposalError(`Safe service answered ${response.status}`);
    const body = (await response.json()) as {
      confirmations?: unknown[];
      confirmationsRequired?: number;
      isExecuted?: boolean;
      isSuccessful?: boolean | null;
      transactionHash?: string | null;
      nonce: number | string;
    };
    return {
      confirmations: body.confirmations?.length ?? 0,
      required: body.confirmationsRequired ?? 0,
      executed: body.isExecuted ?? false,
      successful: body.isSuccessful ?? null,
      transactionHash: body.transactionHash ?? null,
      nonce: Number(body.nonce),
    };
  },
};

let service: SafeService = httpService;

export function safeService(): SafeService {
  return service;
}

/** Test seam. */
export function setSafeServiceForTests(next: SafeService | null) {
  service = next ?? httpService;
  statusCache.clear();
}

export interface Proposal {
  mode: SafeMode;
  safe: Address;
  chainId: number;
  safeTxHash: Hex;
  nonce: number;
  tx: SafeTx;
}

/**
 * Builds and, in service mode, proposes the Safe transaction for one contract call. The
 * nonce follows the Safe's on chain nonce and any transactions already queued, so two
 * approved changes never collide.
 */
export async function proposeToSafe(call: ContractCall): Promise<Proposal> {
  const safe = safeAddress();
  if (!safe) throw new SafeProposalError("AMPEDPAY_SAFE is not set for this environment.");
  let onChainNonce: number;
  try {
    onChainNonce = (await paymentsChain().safe(safe)).nonce;
  } catch (error) {
    console.error("[payments] Safe nonce did not load", error);
    throw new SafeProposalError("The Safe did not answer. Try again in a minute.");
  }
  const mode = safeMode();
  const chainId = paymentChain.id;

  let nonce = onChainNonce;
  if (mode === "service") {
    const queued = await service.pendingNonces(safe, onChainNonce);
    if (queued.length > 0) nonce = Math.max(nonce, Math.max(...queued) + 1);
  }
  const tx = buildSafeTx(call, nonce);
  const hash = safeTxHash(chainId, safe, tx);

  if (mode === "service") {
    const sender = await accountAddress("proposer");
    const data = typedData(chainId, safe, tx);
    const { signature } = await paymentsCdp().signEvmTypedData(sender, {
      domain: { chainId, verifyingContract: safe },
      types: {
        EIP712Domain: [
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        SafeTx: [...SAFE_TX_TYPES.SafeTx],
      },
      primaryType: "SafeTx",
      message: Object.fromEntries(
        Object.entries(data.message).map(([key, value]) => [
          key,
          typeof value === "bigint" ? value.toString() : value,
        ])
      ),
    });
    await service.propose({ safe, tx, safeTxHash: hash, sender, signature });
  }
  return { mode, safe, chainId, safeTxHash: hash, nonce, tx };
}

const statusCache = new Map<string, { at: number; value: SafeTxStatus | null }>();

/** Confirmations for one proposal, cached 30 seconds. Null in manual mode or when unknown. */
export async function proposalStatus(hash: string, now = Date.now()): Promise<SafeTxStatus | null> {
  if (safeMode() !== "service") return null;
  const hit = statusCache.get(hash);
  if (hit && now - hit.at < 30_000) return hit.value;
  try {
    const value = await service.transaction(hash);
    statusCache.set(hash, { at: now, value });
    return value;
  } catch (error) {
    console.warn("[payments] Safe proposal status did not load", error);
    return null;
  }
}
