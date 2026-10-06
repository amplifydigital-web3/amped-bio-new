import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import {
  BASE_REGISTRAR_ABI,
  REGISTRAR_CONTROLLER_ABI,
  RESOLVER_ABI,
  RNS_GRACE_PERIOD_SECONDS,
  rnsExpiryState,
  rnsNode,
  rnsTokenId,
  type RnsExpiryState,
} from "@repo/web3";
import { createSubgraphClient } from "@/services/subgraph/subgraphClient";
import { fetchRegistrationData } from "@/services/subgraph/queries";
import { useWalletContext } from "@/contexts/WalletContext";
import { useAddressSummary, useRnsChain } from "../hooks";

/**
 * Text record keys on the name page (102 D1, 111 I08). url holds the
 * Amped.Bio page link, links holds up to three link block URLs, comma joined.
 * The links key waits on the RNS team; a legacy comma joined url still reads.
 */
export const RNS_RECORD_KEYS = {
  avatar: "avatar",
  banner: "banner",
  bannerMeta: "banner.meta",
  bio: "description",
  url: "url",
  links: "links",
} as const;

export type RnsRecordKey = keyof typeof RNS_RECORD_KEYS;
export type RnsRecords = Partial<Record<RnsRecordKey, string>>;

const KEYS = Object.keys(RNS_RECORD_KEYS) as RnsRecordKey[];
const ZERO = "0x0000000000000000000000000000000000000000";

/** The links a name publishes: the links key, else the legacy comma joined url. */
export function readRnsLinks(records: RnsRecords): string[] {
  const split = (value?: string) =>
    (value ?? "")
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  const links = split(records.links);
  if (links.length) return links.slice(0, 3);
  const url = split(records.url);
  return url.length > 1 ? url.slice(0, 3) : [];
}

export type RnsNameState = {
  label: string;
  status: "loading" | "failed" | "available" | "registered";
  owner: Address | null;
  /** The resolver addr record: where the name points */
  resolvedAddress: Address | null;
  resolver: Address | null;
  /** Registration expiry in seconds (not the grace end) */
  expiry: number | null;
  graceEnd: number | null;
  expiryState: RnsExpiryState | null;
  registeredAt: number | null;
  registrationTx: `0x${string}` | null;
  tokenId: bigint;
  records: RnsRecords;
  /** The connected wallet owns the name */
  isOwner: boolean;
  /** Forward checked primary of the owner equals this name */
  isPrimary: boolean;
  /** The bound Amped.Bio person of the owner (rns.addressSummary), never Authbase attributes */
  person: { handle: string; name: string; image: string | null } | null;
  verified: boolean | null;
  refetch: () => void;
};

/**
 * Screen Review 102: everything the RNS name page reads, without a wallet.
 * On chain reads use the RNS chain; the subgraph adds the registration date
 * and transaction. Expiry is nameExpires (the registration expiry, I05). The
 * owner is ownerOf while active, else the subgraph owner (it lags a transfer).
 */
export function useRnsName(label: string): RnsNameState {
  const chain = useRnsChain();
  const wallet = useWalletContext();
  const tokenId = useMemo(() => rnsTokenId(label), [label]);
  const node = useMemo(() => rnsNode(label, chain.id), [label, chain.id]);
  const resolverAddress = chain.contracts.L2_RESOLVER.address;

  const chainReads = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: chain.contracts.REGISTRAR_CONTROLLER.address,
        abi: REGISTRAR_CONTROLLER_ABI,
        functionName: "available",
        args: [label],
        chainId: chain.id,
      },
      {
        address: chain.contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "nameExpires",
        args: [tokenId],
        chainId: chain.id,
      },
      {
        address: chain.contracts.BASE_REGISTRAR.address,
        abi: BASE_REGISTRAR_ABI,
        functionName: "ownerOf",
        args: [tokenId],
        chainId: chain.id,
      },
      {
        address: resolverAddress,
        abi: RESOLVER_ABI,
        functionName: "addr",
        args: [node],
        chainId: chain.id,
      },
    ],
    query: { staleTime: 15_000, refetchOnWindowFocus: false },
  });

  const textReads = useReadContracts({
    allowFailure: true,
    contracts: KEYS.map(key => ({
      address: resolverAddress,
      abi: RESOLVER_ABI,
      functionName: "text" as const,
      args: [node, RNS_RECORD_KEYS[key]] as const,
      chainId: chain.id,
    })),
    query: { staleTime: 15_000, refetchOnWindowFocus: false },
  });

  const registration = useQuery({
    queryKey: ["rns-registration", chain.id, label],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const result = await fetchRegistrationData(
        rnsTokenIdHex(tokenId),
        createSubgraphClient(chain.subgraphUrl),
        chain
      );
      return result.data;
    },
  });

  const data = chainReads.data;
  const ok = <T>(index: number): T | undefined =>
    data?.[index]?.status === "success" ? (data[index].result as T) : undefined;

  const available = ok<boolean>(0);
  const expiryRaw = ok<bigint>(1);
  const ownerOnChain = ok<Address>(2);
  const addr = ok<Address>(3);
  const records: RnsRecords = {};
  KEYS.forEach((key, index) => {
    const entry = textReads.data?.[index];
    if (entry?.status === "success" && typeof entry.result === "string" && entry.result) {
      records[key] = entry.result;
    }
  });

  const subgraphName = registration.data?.revoNames?.[0];
  const owner = (ownerOnChain ?? (subgraphName?.owner as Address | undefined)) || null;
  const expiry = expiryRaw && expiryRaw > 0n ? Number(expiryRaw) : null;
  const now = Math.floor(Date.now() / 1000);
  const summary = useAddressSummary(owner);

  let status: RnsNameState["status"] = "loading";
  if (chainReads.isError || data?.[0]?.status === "failure") status = "failed";
  else if (available === true) status = "available";
  else if (available === false) status = "registered";

  const primaryName = summary.data?.primaryName ?? null;
  const registeredAt = Number(registration.data?.registration?.registrationDate ?? 0);

  return {
    label,
    status,
    owner,
    resolvedAddress: addr && addr !== ZERO ? addr : null,
    resolver: (subgraphName?.resolver?.address as Address | undefined) ?? resolverAddress,
    expiry,
    graceEnd: expiry ? expiry + RNS_GRACE_PERIOD_SECONDS : null,
    expiryState: expiry ? rnsExpiryState(expiry, now) : null,
    registeredAt: registeredAt > 0 ? registeredAt : null,
    registrationTx: registration.data?.nameRegistereds?.[0]?.transactionID ?? null,
    tokenId,
    records,
    isOwner: !!owner && !!wallet.address && owner.toLowerCase() === wallet.address.toLowerCase(),
    isPrimary: !!primaryName && primaryName.split(".")[0] === label,
    person: summary.data?.person ?? null,
    verified: summary.data?.verified ?? null,
    refetch: () => {
      void chainReads.refetch();
      void textReads.refetch();
      void registration.refetch();
      void summary.refetch();
    },
  };
}

/** The subgraph keys registrations by the label hash as hex. */
const rnsTokenIdHex = (tokenId: bigint) => `0x${tokenId.toString(16).padStart(64, "0")}`;

/** True while the name points to the owner's wallet and is unexpired (12a binding rule). */
export function isBound(name: RnsNameState) {
  return (
    !!name.owner &&
    !!name.resolvedAddress &&
    name.owner.toLowerCase() === name.resolvedAddress.toLowerCase() &&
    (name.expiryState === "active" || name.expiryState === "expiring")
  );
}
