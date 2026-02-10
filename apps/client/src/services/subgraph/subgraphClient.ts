import { getChainConfig } from "@ampedbio/web3";
import { GraphQLClient } from "graphql-request";
import { useMemo } from "react";
import { useChainId } from "wagmi";

// For non-hook contexts (direct function calls)
export function createSubgraphClient(subgraphUrl: string | undefined): GraphQLClient | null {
  if (!subgraphUrl) {
    console.warn("Subgraph URL is undefined for current network");
    return null;
  }
  return new GraphQLClient(subgraphUrl);
}

// Hook for React components
export function useSubgraphClient() {
  const chainId = useChainId();
  const chain = useMemo(() => {
    return getChainConfig(chainId);
  }, [chainId]);

  const client = useMemo(() => {
    if (!chain?.subgraphUrl) {
      console.warn(`No subgraph URL configured for network: ${chain?.name}`);
      return null;
    }
    return new GraphQLClient(chain.subgraphUrl);
  }, [chain]);

  return client;
}
