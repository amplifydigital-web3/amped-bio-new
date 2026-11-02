import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MESSAGE_UI } from "@repo/constants";
import { trpc, trpcClient, useAuth } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useNavigate } from "react-router";
import { MESSAGES_V2 } from "./flags";
import { emitLive, getOpenConversation, setLiveConnected, type LiveEvent } from "./live";
import { refreshPushSubscription } from "./push";

/**
 * The one realtime stream per tab (spec 7.3, 8.1). It feeds open screens through the
 * live bus, refreshes the Inbox list, the rail badge and the bell, shows the D21 toast
 * for a message that is not on screen, and prefixes the tab title with the unseen count.
 * Mounted once in Layout behind VITE_MESSAGES.
 */
export function MessagesRealtime() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const signedIn = MESSAGES_V2 && !!authUser;

  useEffect(() => {
    if (!signedIn) return;
    void refreshPushSubscription();

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshLists = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.messages.unread.pathKey() });
      }, 250);
    };
    const refreshBell = () => {
      void queryClient.invalidateQueries({ queryKey: trpc.notifications.list.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.notifications.unseenCount.pathKey() });
    };

    const subscription = trpcClient.realtime.events.subscribe(
      {},
      {
        onStarted: () => setLiveConnected(true),
        onData(raw: unknown) {
          // Tracked events arrive as { id, data }; keep the event either way
          const wrapped = raw as { id?: string; data?: unknown };
          const event = (wrapped && "data" in wrapped ? wrapped.data : raw) as LiveEvent;
          if (!event || typeof event !== "object" || !("type" in event)) return;
          setLiveConnected(true);
          emitLive(event);
          switch (event.type) {
            case "message.new":
              refreshLists();
              if (!event.message.mine && getOpenConversation() !== event.conversationId) {
                showMessageToast(queryClient, event, path => navigateRef.current(path));
              }
              return;
            case "message.unsent":
            case "conversation.updated":
            case "unread.changed":
              refreshLists();
              return;
            case "notification.new":
              refreshBell();
              return;
            case "resync":
              refreshLists();
              refreshBell();
              void queryClient.invalidateQueries({ queryKey: trpc.messages.get.pathKey() });
              return;
            default:
              return;
          }
        },
        onError: () => setLiveConnected(false),
        onStopped: () => setLiveConnected(false),
      }
    );
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      subscription.unsubscribe();
      setLiveConnected(false);
    };
  }, [signedIn, queryClient]);

  useTabTitleCount(signedIn);
  return null;
}

type ListPage = {
  rows: {
    conversationId: string;
    muted: boolean;
    person: { name: string; handle: string | null } | null;
  }[];
};

/** Sender and first line, one ghost Reply, 5 s; never for a muted conversation. */
function showMessageToast(
  queryClient: ReturnType<typeof useQueryClient>,
  event: Extract<LiveEvent, { type: "message.new" }>,
  navigate: (path: string) => void
) {
  const pages = queryClient.getQueriesData<{ pages: ListPage[] }>({
    queryKey: trpc.messages.list.pathKey(),
  });
  const row = pages
    .flatMap(([, data]) => data?.pages ?? [])
    .flatMap(page => page.rows)
    .find(r => r.conversationId === event.conversationId);
  if (row?.muted) return;
  const request = event.folder === "REQUESTS";
  const name = row?.person?.name || (row?.person?.handle ? `@${row.person.handle}` : null);
  const firstLine = (event.message.body ?? "").split("\n")[0]?.slice(0, 120) ?? "";
  const open = () => navigate(`/inbox?${request ? "tab=requests&" : ""}c=${event.conversationId}`);
  toast.add({
    type: "info",
    title: request
      ? MESSAGE_UI.bell.request(row?.person?.handle ?? MESSAGE_UI.bell.someone)
      : (name ?? MESSAGE_UI.newMessage),
    // A request never shows the stranger's text outside the Requests view
    description: request ? undefined : firstLine,
    actionProps: { children: MESSAGE_UI.toast.reply, onClick: open },
  });
}

/** "(3) Amped.Bio" while there are unseen alerts (spec 8.1 item 5). */
function useTabTitleCount(enabled: boolean) {
  const unseen = useQuery({
    ...trpc.notifications.unseenCount.queryOptions(),
    enabled,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  const count = enabled ? (unseen.data?.count ?? 0) : 0;
  useEffect(() => {
    const strip = (title: string) => title.replace(/^\(\d+\+?\)\s/, "");
    const apply = () => {
      const base = strip(document.title);
      const next = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Destinations set their own titles: keep the prefix on them
    const title = document.querySelector("title");
    const observer = title ? new MutationObserver(apply) : null;
    if (title) observer!.observe(title, { childList: true });
    return () => {
      observer?.disconnect();
      document.title = strip(document.title);
    };
  }, [count]);
}
