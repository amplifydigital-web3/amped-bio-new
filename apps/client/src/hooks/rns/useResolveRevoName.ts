import { checkRnsLabel, getChainConfig, parseRnsInput, RESOLVER_ABI, rnsNode } from "@repo/web3";
import { useChainId, useReadContract } from "wagmi";

/**
 * Resolves an RNS name to its addr record. Takes what a person typed: a bare
 * label, the chain suffix or a known one (.revo, .revotest.eth, .eth) all
 * resolve to the same node (100 I01).
 */
export function useResolveRevoName(input: string) {
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId ?? 0);

  const label = input ? parseRnsInput(input, chainId) : "";
  const isValid = !!label && checkRnsLabel(label) === null;
  const node = isValid ? rnsNode(label, chainId) : undefined;

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
    label,
    address: address as `0x${string}` | undefined,
    isLoading,
    error,
  };
}
