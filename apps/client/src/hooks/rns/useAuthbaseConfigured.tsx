import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

/**
 * Whether the Authbase integration is configured on the server. Used to gate
 * the Identity tab: when unconfigured we hide the feature rather than letting
 * every profile view render an "Unavailable" error. Cached aggressively since
 * config only changes on redeploy.
 */
export function useAuthbaseConfigured(): boolean {
  const { data } = useQuery({
    ...trpc.authbase.isConfigured.queryOptions(),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  // Default to false until we know — hides the tab during load rather than
  // flashing it and then pulling it away.
  return data?.configured ?? false;
}
