import { useChainId, useReadContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import {
  BASE_REGISTRAR_ABI,
  getChainConfig,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
} from "@ampedbio/web3";

export function useReverseLookup(address: `0x${string}`) {
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);

  // Reverse node for the address (namehash of `<address>.addr.reverse`).
  const { data: reverseNode, isLoading: isLoadingNode } = useReadContract({
    address: networkConfig?.contracts?.REVERSE_REGISTRAR.address,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: "node",
    args: [address],
    query: {
      enabled: Boolean(address && networkConfig?.contracts?.REVERSE_REGISTRAR.address),
    },
  });

  const { data: name, isLoading: isLoadingName } = useReadContract({
    address: networkConfig?.contracts?.L2_RESOLVER.address,
    abi: RESOLVER_ABI,
    functionName: "name",
    args: [reverseNode as `0x${string}`],
    query: {
      enabled: Boolean(reverseNode && networkConfig?.contracts?.L2_RESOLVER.address),
    },
  });

  // Forward-verify the reverse record. A primary name is self-asserted via the
  // reverse registrar and is NOT cleared when the name is transferred or
  // expires, so an address can keep claiming a name it no longer owns. Only
  // trust the name as a primary name if the address still owns it on-chain.
  // This registrar (basenames / ens-subdomains fork) overrides `ownerOf` with an
  // `onlyNonExpired` modifier that reverts `Expired` once `nameExpires <= now`,
  // so a transferred OR expired name makes this read revert → `owner` undefined
  // → treated as unowned. A separate `nameExpires > now` check is therefore
  // redundant here (the revert is in fact stricter — it fires at expiry, before
  // the grace period).
  const label = name ? name.split(".")[0] : "";
  const tokenId = label ? BigInt(keccak256(toBytes(label))) : undefined;

  const { data: owner, isLoading: isLoadingOwner } = useReadContract({
    address: networkConfig?.contracts?.BASE_REGISTRAR.address,
    abi: BASE_REGISTRAR_ABI,
    functionName: "ownerOf",
    args: [tokenId as bigint],
    query: {
      enabled: Boolean(tokenId && networkConfig?.contracts?.BASE_REGISTRAR.address),
    },
  });

  const isOwnedByAddress =
    Boolean(owner) && (owner as string)?.toLowerCase() === address?.toLowerCase();
  const verifiedName = isOwnedByAddress ? name : undefined;

  return {
    isLoadingAddr: isLoadingNode || isLoadingName || isLoadingOwner,
    fullName: verifiedName,
    name: verifiedName ? verifiedName.split(".")[0] : "",
  };
}
