import { getChainConfig, RESOLVER_ABI } from "@ampedbio/web3";
import { namehash } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { DOMAIN_SUFFIX } from "@/config/rns/constants";

export function useResolveRevoName(name: string) {
  const { chainId } = useAccount();
  const networkConfig = getChainConfig(chainId ?? 0);

  // Only resolve if name is valid
  const isValid = !!name && name.endsWith(DOMAIN_SUFFIX);
  const node = isValid ? namehash(name) : undefined;

  const {
    data: address,
    isLoading,
    error,
  } = useReadContract({
    address: networkConfig?.contracts.L2_RESOLVER.address,
    abi: RESOLVER_ABI,
    functionName: "addr",
    args: node ? [node] : undefined,
    query: {
      enabled: isValid && Boolean(node && networkConfig?.contracts.L2_RESOLVER.address),
    },
  });

  return {
    address: address as `0x${string}` | undefined,
    isLoading,
    error,
  };
}
