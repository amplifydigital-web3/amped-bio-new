import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { encodeFunctionData, type Address, type PublicClient } from "viem";
import {
  BASE_REGISTRAR_ABI,
  formatRnsName,
  getChainConfig,
  isRnsNameActive,
  parseRnsInput,
  REGISTRAR_CONTROLLER_ABI,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
  rnsNode,
  rnsTokenId,
} from "@repo/web3";
import { classifyTxError } from "@/components/panels/explore/pool-panel/format";

type RnsContracts = NonNullable<ReturnType<typeof getChainConfig>>["contracts"];

/**
 * The wallet's primary RNS name, forward checked: the reverse record names a
 * label and BaseRegistrar ownerOf that label is the wallet (ownerOf reverts
 * once the name expires). null when there is no live primary.
 */
export async function readPrimaryName(
  client: PublicClient,
  contracts: RnsContracts,
  wallet: Address,
  chainId: number
): Promise<string | null> {
  const node = await client.readContract({
    address: contracts.REVERSE_REGISTRAR.address,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: "node",
    args: [wallet],
  });
  const name = (await client.readContract({
    address: contracts.L2_RESOLVER.address,
    abi: RESOLVER_ABI,
    functionName: "name",
    args: [node as `0x${string}`],
  })) as string;
  const label = name ? parseRnsInput(name, chainId) : "";
  if (!label) return null;
  try {
    const [owner, expiry] = await Promise.all([
      client.readContract({
        address: contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [rnsTokenId(label)],
      }) as Promise<string>,
      client.readContract({
        address: contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "nameExpires",
        args: [rnsTokenId(label)],
      }) as Promise<bigint>,
    ]);
    const owned = owner.toLowerCase() === wallet.toLowerCase() && isRnsNameActive(Number(expiry));
    return owned ? formatRnsName(label, chainId) : null;
  } catch {
    // ownerOf reverts for an expired or transferred name: no live primary
    return null;
  }
}

export type TxPhase = "idle" | "signing" | "chain" | "done" | "declined" | "failed";

export type TxState = {
  phase: TxPhase;
  hash?: `0x${string}`;
  /** Value sent plus gasUsed times effectiveGasPrice, from the receipt */
  paidWei?: bigint;
  reverted?: boolean;
  /** Why a write failed, for the error card (QA-044) */
  reason?: TxFailReason;
};

export type TxFailReason = "wallet-timeout" | "wallet-error" | "receipt-timeout" | "reverted";

/** How long the wallet gets to answer a signing request (QA-044). */
export const WALLET_SIGN_TIMEOUT_MS = 120_000;
/** How long the chain gets to include a sent transaction (QA-044). */
export const RECEIPT_TIMEOUT_MS = 180_000;

class TxTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TxTimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Text for the error card, by failure reason (QA-044). */
export function txFailureCause(state: TxState, fallback: string) {
  switch (state.reason) {
    case "wallet-timeout":
      return "Your wallet did not answer within two minutes. Nothing was sent. Try again.";
    case "receipt-timeout":
      return "The transaction was sent but the network has not included it after three minutes. Check it in the explorer before trying again.";
    case "reverted":
      return "The transaction failed on chain. The amount did not move. The network fee may still be charged.";
    default:
      return fallback;
  }
}

/** Network fee estimate: estimateContractGas times the current gas price. */
export function useFeeEstimate(
  key: unknown[],
  enabled: boolean,
  estimate: (client: PublicClient) => Promise<bigint>
) {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ["rns-fee", ...key],
    enabled: enabled && !!publicClient,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const client = publicClient as PublicClient;
      const [gas, gasPrice] = await Promise.all([estimate(client), client.getGasPrice()]);
      return gas * gasPrice;
    },
  });
}

/** Runs one write and tracks it: signing, on chain, done, declined or failed. */
export function useTrackedWrite() {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (request: Parameters<typeof writeContractAsync>[0], value: bigint) => {
      setState({ phase: "signing" });
      let hash: `0x${string}`;
      try {
        // QA-044: a wallet that never answers (popup lost, embed not ready)
        // left the flow on "Confirm in wallet" for good. Bound the wait.
        hash = await withTimeout(
          writeContractAsync(request),
          WALLET_SIGN_TIMEOUT_MS,
          "Wallet did not respond"
        );
      } catch (error) {
        console.error("RNS write failed in the wallet", error);
        if (classifyTxError(error) === "rejected") {
          setState({ phase: "declined" });
        } else {
          setState({
            phase: "failed",
            reason: error instanceof TxTimeoutError ? "wallet-timeout" : "wallet-error",
          });
        }
        return false;
      }
      setState({ phase: "chain", hash });
      try {
        const receipt = await (publicClient as PublicClient).waitForTransactionReceipt({
          hash,
          timeout: RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== "success") {
          setState({ phase: "failed", hash, reverted: true, reason: "reverted" });
          return false;
        }
        const paidWei = value + receipt.gasUsed * receipt.effectiveGasPrice;
        setState({ phase: "done", hash, paidWei });
        return true;
      } catch (error) {
        console.error("RNS transaction receipt wait failed", error);
        setState({ phase: "failed", hash, reason: "receipt-timeout" });
        return false;
      }
    },
    [publicClient, writeContractAsync]
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, run, reset };
}

/**
 * Screen Review 078: register one RNS name for the signing wallet. The
 * primary name is kept when the wallet has one (reverseRecord false, D2) and
 * set for a first name. The fee is estimated for the exact call.
 */
export function useRegisterName(
  label: string,
  durationSeconds: bigint | undefined,
  priceWei?: bigint
) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const networkConfig = getChainConfig(chainId ?? 0);
  const contracts = networkConfig?.contracts;
  const tracked = useTrackedWrite();

  const primary = useQuery({
    queryKey: ["rns-primary", address, chainId],
    enabled: !!address && !!contracts && !!publicClient && !!chainId,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => readPrimaryName(publicClient as PublicClient, contracts!, address!, chainId!),
  });

  // A failed primary read keeps the primary as it is (reverseRecord false)
  const reverseRecord = primary.isSuccess ? primary.data === null : false;

  const request = () => {
    if (!address || !contracts || durationSeconds === undefined || priceWei === undefined) {
      return null;
    }
    let resolverData: `0x${string}`;
    try {
      resolverData = encodeFunctionData({
        abi: RESOLVER_ABI,
        functionName: "setAddr",
        args: [rnsNode(label, chainId), address],
      });
    } catch {
      return null;
    }
    return {
      address: contracts.REGISTRAR_CONTROLLER.address,
      abi: REGISTRAR_CONTROLLER_ABI,
      functionName: "register" as const,
      args: [
        {
          name: label,
          owner: address,
          duration: durationSeconds,
          resolver: contracts.L2_RESOLVER.address,
          data: [resolverData],
          reverseRecord,
        },
      ] as const,
      value: priceWei,
    };
  };

  const fee = useFeeEstimate(
    [
      "register",
      label,
      durationSeconds?.toString(),
      priceWei?.toString(),
      address,
      reverseRecord,
      chainId,
    ],
    !!request() && !primary.isLoading,
    client =>
      client.estimateContractGas({
        ...(request() as NonNullable<ReturnType<typeof request>>),
        account: address!,
      })
  );

  const register = async () => {
    const req = request();
    if (!req) return false;
    return tracked.run(req as unknown as Parameters<typeof tracked.run>[0], req.value);
  };

  return {
    primaryName: primary.data ?? null,
    primaryLoading: primary.isLoading,
    reverseRecord,
    feeWei: fee.data,
    feeLoading: fee.isLoading,
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    tx: tracked.state,
    register,
    reset: tracked.reset,
  };
}

/** 078 I13: Set as primary runs REVERSE_REGISTRAR setName(<full name>). */
export function useSetPrimaryName(fullName: string) {
  const { address, chainId } = useAccount();
  const contracts = getChainConfig(chainId ?? 0)?.contracts;
  const tracked = useTrackedWrite();
  const request = contracts
    ? {
        address: contracts.REVERSE_REGISTRAR.address,
        abi: REVERSE_REGISTRAR_ABI,
        functionName: "setName" as const,
        args: [fullName] as const,
      }
    : null;

  const fee = useFeeEstimate(
    ["setName", fullName, address, chainId],
    !!request && !!address,
    client => client.estimateContractGas({ ...request!, account: address! })
  );

  return {
    feeWei: fee.data,
    feeLoading: fee.isLoading,
    feeFailed: fee.isError,
    retryFee: () => void fee.refetch(),
    tx: tracked.state,
    setPrimary: () =>
      request
        ? tracked.run(request as unknown as Parameters<typeof tracked.run>[0], 0n)
        : Promise.resolve(false),
    reset: tracked.reset,
  };
}
