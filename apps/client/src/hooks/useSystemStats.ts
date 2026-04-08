import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

const DEFAULT_CHAIN_ID = "73863";

export function useSystemStats(chainId: string = DEFAULT_CHAIN_ID) {
  const { data, isLoading, error } = useQuery({
    ...trpc.pools.fan.getSystemStats.queryOptions({ chainId }),
    staleTime: 900000,
    refetchInterval: 900000,
  });

  return {
    data,
    isLoading,
    error,
  };
}
