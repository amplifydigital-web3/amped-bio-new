import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@repo/ui";

// QA-008 (Fan Graph #22). An account made from Follow has an unpublished page
// until its owner publishes it. While unpublished, nothing in the editor
// pretends the page is live: View page, Copy page link and Share are disabled
// with the reason below. Accounts with a published page see no change.

export const FAN_GRAPH = import.meta.env.VITE_FAN_GRAPH === "true";

export const PUBLISH_FIRST = "Publish your page first.";

/**
 * True only once the server says the page is unpublished. While loading, on
 * an error, or with the flag off, the page counts as published, so creators
 * never see a disabled share action.
 */
export function usePageUnpublished() {
  const me = useQuery({
    ...trpc.auth.me.queryOptions(),
    enabled: FAN_GRAPH,
    staleTime: 60_000,
  });
  return FAN_GRAPH && me.data?.user.pageStatus === "UNPUBLISHED";
}

/** Refreshes every read that carries the page status after publish or unpublish. */
export function useRefreshPageStatus() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.auth.me.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() }),
    ]);
}
