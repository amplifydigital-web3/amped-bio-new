import { useChainId, useReadContract } from "wagmi";
import { getChainConfig, RESOLVER_ABI, REVERSE_REGISTRAR_ABI } from "@ampedbio/web3";

export function useReverseLookup(address: `0x${string}`) {
  const chainId = useChainId();
  const networkConfig = getChainConfig(chainId);

  const { data: labelHash, isLoading: isLoadingAddr } = useReadContract({
    address: networkConfig?.contracts?.REVERSE_REGISTRAR.address,
    abi: REVERSE_REGISTRAR_ABI,
    functionName: "node",
    args: [address],
    query: {
      enabled: Boolean(address && networkConfig?.contracts?.REVERSE_REGISTRAR.address),
    },
  });

  const { data: name } = useReadContract({
    address: networkConfig?.contracts?.L2_RESOLVER.address,
    abi: RESOLVER_ABI,
    functionName: "name",
    args: [labelHash as `0x${string}`],
    query: {
      enabled: Boolean(labelHash && networkConfig?.contracts?.L2_RESOLVER.address),
    },
  });

  return {
    isLoadingAddr: isLoadingAddr,
    fullName: name,
    name: name ? name.split(".")[0] : "",
  };
}
