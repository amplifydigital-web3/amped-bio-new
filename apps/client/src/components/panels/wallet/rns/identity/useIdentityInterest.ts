import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@repo/ui";

/**
 * Screen Review 105 I04, 106 I08: one Notify me record for attributes and
 * facets. A tap on either tab sets both.
 */
export function useIdentityInterest() {
  const queryClient = useQueryClient();
  const options = trpc.authbase.identityInterest.queryOptions();
  const query = useQuery({ ...options, staleTime: 60_000, retry: 1 });
  const mutation = useMutation({
    ...trpc.authbase.setIdentityInterest.mutationOptions(),
    onSuccess: data => queryClient.setQueryData(options.queryKey, { on: data.on }),
  });
  return { query, mutation };
}
