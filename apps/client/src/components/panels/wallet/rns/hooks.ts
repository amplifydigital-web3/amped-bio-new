import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts, useSwitchChain } from "wagmi";
import {
  BASE_REGISTRAR_ABI,
  checkRnsLabel,
  getChainConfig,
  libertasTestnet,
  parseRnsInput,
  REGISTRAR_CONTROLLER_ABI,
  RESOLVER_ABI,
  rnsNode,
  rnsTokenId,
  type RnsLabelProblem,
} from "@repo/web3";
import { trpc } from "@repo/ui";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Screen Review 101 I09, 078 I05: RNS works only where the signing wallet's
 * chain has a registrar. Decided from wagmi useAccount, never from the saved
 * account address.
 */
export function useRnsNetwork() {
  const { chainId, isConnected, address } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const chain = chainId ? getChainConfig(chainId) : null;
  const registrar = chain?.contracts.REGISTRAR_CONTROLLER.address;
  const supported = !!registrar && registrar !== ZERO;
  return {
    isConnected,
    address: address as Address | undefined,
    chainId,
    chain,
    /** Connected to a chain without the RNS registrar */
    wrongNetwork: isConnected && !supported,
    switching: isPending,
    switchToLibertas: () => switchChain({ chainId: libertasTestnet.id }),
  };
}

/** The chain the RNS reads use: the wallet's chain when it has RNS, else Libertas. */
export function useRnsChain() {
  const { chainId } = useAccount();
  const chain = chainId ? getChainConfig(chainId) : null;
  const registrar = chain?.contracts.REGISTRAR_CONTROLLER.address;
  return chain && registrar && registrar !== ZERO ? chain : libertasTestnet;
}

export type RnsSearch =
  | { kind: "empty" }
  | { kind: "invalid"; problem: RnsLabelProblem }
  | { kind: "address"; address: Address }
  | { kind: "name"; label: string };

/** 101 I03: every input goes through parseRnsInput before the name rule runs. */
export function readRnsSearch(input: string, chainId: number): RnsSearch {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  if (isAddress(trimmed)) return { kind: "address", address: trimmed as Address };
  const label = parseRnsInput(trimmed, chainId);
  const problem = checkRnsLabel(label);
  return problem ? { kind: "invalid", problem } : { kind: "name", label };
}

/** The registrar minimum term (seconds). */
export function useMinRegistration() {
  const chain = useRnsChain();
  const query = useReadContract({
    address: chain.contracts.REGISTRAR_CONTROLLER.address,
    abi: REGISTRAR_CONTROLLER_ABI,
    functionName: "minRegistrationDuration",
    chainId: chain.id,
    query: { staleTime: 10 * 60_000 },
  });
  return { ...query, data: query.data as bigint | undefined };
}

export type Availability = "checking" | "available" | "registered" | "error";

/**
 * 101 I04: four explicit outcomes. Available only when available() is true,
 * Registered only when it is false, Could not check on a failed read.
 */
export function useRnsAvailability(label: string | null, durationSeconds?: bigint) {
  const chain = useRnsChain();
  const registrar = chain.contracts.REGISTRAR_CONTROLLER.address;
  const enabled = !!label && durationSeconds !== undefined;
  const query = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: registrar,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [label ?? ""],
        chainId: chain.id,
      },
      {
        address: registrar,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "registerPrice",
        args: [label ?? "", durationSeconds ?? 0n],
        chainId: chain.id,
      },
    ],
    query: { enabled, staleTime: 15_000, refetchOnWindowFocus: false },
  });
  const [available, price] = query.data ?? [];
  let status: Availability = "checking";
  if (query.isError || available?.status === "failure") status = "error";
  else if (available?.status === "success") status = available.result ? "available" : "registered";
  return {
    status: enabled ? status : ("checking" as Availability),
    priceWei: price?.status === "success" ? (price.result as bigint) : undefined,
    priceFailed: price?.status === "failure",
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

/** BaseRegistrar owner of a registered label (reverts once expired). */
export function useRnsOwner(label: string | null) {
  const chain = useRnsChain();
  const query = useReadContract({
    address: chain.contracts.BASE_REGISTRAR.address,
    abi: BASE_REGISTRAR_ABI,
    functionName: "ownerOf",
    args: [label ? rnsTokenId(label) : 0n],
    chainId: chain.id,
    query: { enabled: !!label, retry: false },
  });
  return query.data as Address | undefined;
}

/** 100 I08: owner line, primary name and the Verified boolean. Never attributes. */
export function useAddressSummary(address: string | null | undefined) {
  const valid = !!address && isAddress(address);
  return useQuery({
    ...trpc.rns.addressSummary.queryOptions({ address: valid ? address : "" }),
    enabled: valid,
    staleTime: 60_000,
    retry: 1,
  });
}

/** The avatar text record of each label, for the name rows (101 I10). */
export function useRnsAvatars(labels: string[]) {
  const chain = useRnsChain();
  const query = useReadContracts({
    allowFailure: true,
    contracts: labels.map(label => ({
      address: chain.contracts.L2_RESOLVER.address,
      abi: RESOLVER_ABI,
      functionName: "text" as const,
      args: [rnsNode(label, chain.id), "avatar"] as const,
      chainId: chain.id,
    })),
    query: { enabled: labels.length > 0, staleTime: 5 * 60_000 },
  });
  return useMemo(() => {
    const map: Record<string, string> = {};
    labels.forEach((label, index) => {
      const entry = query.data?.[index];
      if (entry?.status === "success" && typeof entry.result === "string" && entry.result) {
        map[label] = entry.result;
      }
    });
    return map;
  }, [labels, query.data]);
}
