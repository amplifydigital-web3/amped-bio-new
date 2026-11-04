import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { MessageCircle, SquarePen } from "lucide-react";
import { MESSAGE_UI } from "@repo/constants";
import { CountBadge, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@repo/ui";
import { BROADCAST_ON } from "../broadcast/utils";
import { UpdatesTab } from "../broadcast/InboxPanel";
import { ConversationList } from "./ConversationList";
import { ConversationView } from "./ConversationView";
import { NewMessageSheet } from "./NewMessageSheet";
import { useMessagesUnread } from "./useMessagesUnread";
import type { InboxTab } from "./flags";

const S = MESSAGE_UI;

/**
 * Inbox (spec 8.2, boards m1 to m4): Primary, Requests and Broadcast tabs. Desktop shows
 * the list (360) beside the open conversation; a phone shows one at a time with Back.
 * URL: ?tab=primary|requests|broadcast, ?c={conversationId}, ?archived=1, ?to={handle}.
 */
export function MessagesInbox() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: InboxTab =
    raw === "requests" || (raw === "broadcast" && BROADCAST_ON) ? raw : "primary";
  const openId = params.get("c");
  const archived = params.get("archived") === "1";
  const toHandle = params.get("to");
  const [composing, setComposing] = useState(!!toHandle);
  const { conversations, requests } = useMessagesUnread();

  useEffect(() => {
    if (toHandle) setComposing(true);
  }, [toHandle]);

  const update = useCallback(
    (change: (next: URLSearchParams) => void, replace = false) =>
      setParams(
        current => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        { replace }
      ),
    [setParams]
  );

  const setTab = (next: string) =>
    update(p => {
      p.set("tab", next);
      p.delete("c");
      p.delete("archived");
    }, true);
  const open = useCallback(
    (conversationId: string, folder?: "PRIMARY" | "REQUESTS") =>
      update(p => {
        if (folder) p.set("tab", folder === "REQUESTS" ? "requests" : "primary");
        p.set("c", conversationId);
      }),
    [update]
  );
  const close = useCallback(() => update(p => p.delete("c")), [update]);
  const gone = useCallback(() => update(p => p.delete("c"), true), [update]);

  const folder = tab === "requests" ? "REQUESTS" : "PRIMARY";
  const conversationTab = tab === "primary" || tab === "requests";

  return (
    <div className="flex flex-col gap-[13px] px-4 pb-6 pt-5 md:px-6">
      <div className="flex items-center gap-3">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 flex-1">
          <TabsList aria-label="Inbox sections" className="max-sm:w-full">
            <TabsTrigger value="primary" className="max-sm:flex-1">
              {S.tabs.primary}
            </TabsTrigger>
            <TabsTrigger
              value="requests"
              className="gap-2 max-sm:flex-1"
              aria-label={requests > 0 ? `${S.tabs.requests}, ${requests}` : S.tabs.requests}
            >
              {S.tabs.requests}
              <CountBadge count={requests} variant="tab" />
            </TabsTrigger>
            {BROADCAST_ON && (
              <TabsTrigger value="broadcast" className="max-sm:flex-1">
                {S.tabs.broadcast}
              </TabsTrigger>
            )}
          </TabsList>
          {/* The panels render below; Tabs keeps the keyboard and aria wiring */}
          <TabsContent value="primary" className="hidden" />
          <TabsContent value="requests" className="hidden" />
          {BROADCAST_ON && <TabsContent value="broadcast" className="hidden" />}
        </Tabs>
        {conversationTab && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label={S.newMessage}
            className="prism-icon-btn prism-focus shrink-0"
          >
            <SquarePen
              aria-hidden
              className="h-[21px] w-[21px] text-prism-ink-2"
              strokeWidth={1.5}
            />
          </button>
        )}
      </div>

      {tab === "broadcast" ? (
        <UpdatesTab />
      ) : (
        <div
          className={cn(
            "grid min-h-[560px] gap-[13px] lg:h-[calc(100dvh-200px)] lg:grid-cols-[360px_minmax(0,1fr)]",
            openId && "max-lg:h-[calc(100dvh-230px)]"
          )}
        >
          <section
            aria-label={folder === "REQUESTS" ? S.tabs.requests : S.tabs.primary}
            className={cn(
              "prism-glass-clear flex min-h-0 flex-col overflow-hidden",
              openId && "max-lg:hidden"
            )}
          >
            <span className="sr-only" aria-live="polite">
              {conversations > 0 ? `${conversations} unread` : ""}
            </span>
            <ConversationList
              folder={folder}
              openId={openId}
              onOpen={id => open(id)}
              onNewMessage={() => setComposing(true)}
              archived={archived}
              onToggleArchived={next =>
                update(p => {
                  if (next) p.set("archived", "1");
                  else p.delete("archived");
                  p.delete("c");
                }, true)
              }
            />
          </section>
          <section
            aria-label="Conversation"
            className={cn("prism-glass-clear min-h-0 overflow-hidden", !openId && "max-lg:hidden")}
          >
            {openId ? (
              <ConversationView key={openId} conversationId={openId} onBack={close} onGone={gone} />
            ) : (
              <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 p-5 text-center">
                <MessageCircle
                  aria-hidden
                  className="h-[34px] w-[34px] text-prism-ink-3"
                  strokeWidth={1.5}
                />
                <p className="text-prism-label text-prism-ink-2">{S.pickConversation}</p>
              </div>
            )}
          </section>
        </div>
      )}

      <NewMessageSheet
        open={composing}
        initialHandle={toHandle}
        onOpenChange={next => {
          setComposing(next);
          if (!next && toHandle) update(p => p.delete("to"), true);
        }}
        onOpenConversation={(id, f) => open(id, f)}
      />
    </div>
  );
}
