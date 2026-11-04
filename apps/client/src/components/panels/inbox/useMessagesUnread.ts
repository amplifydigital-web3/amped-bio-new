import { useQuery } from "@tanstack/react-query";
import { trpc, useAuth } from "@repo/ui";
import { MESSAGES_V2 } from "./flags";

/** Unread conversations for the rail badge and the dock (requests never raise it). */
export function useMessagesUnread() {
  const { authUser } = useAuth();
  const query = useQuery({
    ...trpc.messages.unread.queryOptions(),
    enabled: MESSAGES_V2 && !!authUser,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  return { conversations: query.data?.conversations ?? 0, requests: query.data?.requests ?? 0 };
}
