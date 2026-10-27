import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";

/**
 * Whether the Authbase integration is configured on the server. Used to gate
 * the Identity tab: when unconfigured we hide the feature rather than letting
 * every profile view render an "Unavailable" error. Cached aggressively since
 * config only changes on redeploy.
 */
function useAuthbaseConfig() {
  return useQuery({
    ...trpc.authbase.isConfigured.queryOptions(),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export function useAuthbaseConfigured(): boolean {
  const { data } = useAuthbaseConfig();
  // Default to false until we know — hides the tab during load rather than
  // flashing it and then pulling it away.
  return data?.configured ?? false;
}

/**
 * Screen Review 079 D2: true when the server shows a Verified owner's shared
 * attributes to visitors (RNS_PUBLIC_ATTRIBUTES). False until we know.
 */
export function useAuthbasePublicAttributes(): boolean {
  const { data } = useAuthbaseConfig();
  return data?.publicAttributes ?? false;
}
