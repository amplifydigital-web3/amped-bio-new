import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ChevronLeft, MoreHorizontal } from "lucide-react";
import { MESSAGE_LIMITS, MESSAGE_UI } from "@repo/constants";
import {
  Button,
  DayLabel,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  MessageBubble,
  Notice,
  Skeleton,
  TypingIndicator,
  cn,
  formatHandle,
  trpc,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { ConfirmDialog, ReportDialog } from "./dialogs";
import { PushAsk } from "./PushAsk";
import { emitLive, onLive, setOpenConversation, type LiveMessage } from "./live";
import { MessageText, PersonAvatar, RelationLabel } from "./parts";
import { pushAskDue } from "./push";
import { atHandle, clock, dayKey, dayLabel, errorMessage, newIdempotencyKey } from "./util";

type Page = RouterOutputs["messages"]["get"];
type Pending = { key: string; body: string; createdAt: Date; failed: boolean; error?: string };

const S = MESSAGE_UI;
const LANDING = import.meta.env.VITE_LANDINGPAGE_URL as string | undefined;

/**
 * One conversation (spec 8.2 items 4 to 7, boards m1, m3 and m8): header with the
 * person and the actions menu, messages grouped by day, read receipt, typing dots, the
 * composer, the request bar, and refusals as inline notices. Live updates come from
 * the realtime stream through the live bus.
 */
export function ConversationView({
  conversationId,
  onBack,
  onGone,
}: {
  conversationId: string;
  onBack: () => void;
  /** The conversation left this folder (deleted, blocked from Requests) */
  onGone: () => void;
}) {
  const queryClient = useQueryClient();
  const thread = useInfiniteQuery({
    ...trpc.messages.get.infiniteQueryOptions(
      { conversationId },
      {
        getNextPageParam: last => last.nextBefore ?? undefined,
      }
    ),
  });
  const first = thread.data?.pages[0];
  const skeleton = useDelayed(thread.isLoading, 400);

  // Live: messages and removals that arrived while open, receipts and typing
  const [live, setLive] = useState<LiveMessage[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [seen, setSeen] = useState<{ id: string | null; at: string | null } | null>(null);
  const [typingUntil, setTypingUntil] = useState(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [flagged, setFlagged] = useState(false);
  const [pushAsk, setPushAsk] = useState(false);

  useEffect(() => {
    setLive([]);
    setRemoved(new Set());
    setSeen(null);
    setTypingUntil(0);
    setPending([]);
    setFlagged(false);
  }, [conversationId]);

  const markRead = useRef<ReturnType<typeof setTimeout> | null>(null);
  const read = useCallback(
    (messageId?: string) => {
      if (document.visibilityState !== "visible") return;
      if (markRead.current) clearTimeout(markRead.current);
      markRead.current = setTimeout(() => {
        void trpcClient.messages.read
          .mutate({ conversationId, messageId: messageId ?? null })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: trpc.messages.unread.pathKey() });
            void queryClient.invalidateQueries({
              queryKey: trpc.notifications.unseenCount.pathKey(),
            });
            void queryClient.invalidateQueries({ queryKey: trpc.notifications.list.pathKey() });
          })
          .catch(() => undefined);
      }, 300);
    },
    [conversationId, queryClient]
  );

  useEffect(() => {
    setOpenConversation(conversationId);
    return () => setOpenConversation(null);
  }, [conversationId]);

  // Opening reads it; so does coming back to the tab
  useEffect(() => {
    if (!first) return;
    read();
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [first?.conversationId, read]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      onLive(event => {
        if (!("conversationId" in event) || event.conversationId !== conversationId) return;
        switch (event.type) {
          case "message.new":
            setLive(current =>
              current.some(m => m.id === event.message.id) ? current : [...current, event.message]
            );
            if (!event.message.mine) {
              setTypingUntil(0);
              read(event.message.id);
            }
            return;
          case "message.unsent":
            setRemoved(current => new Set(current).add(event.messageId));
            return;
          case "conversation.read":
            setSeen({ id: event.messageId, at: event.at });
            return;
          case "typing":
            setTypingUntil(Date.now() + event.seconds * 1000);
            return;
          case "conversation.updated":
            if (event.change === "deleted") onGone();
            else void thread.refetch();
            return;
          default:
            return;
        }
      }),
    [conversationId, read, onGone, thread]
  );

  // Typing dots time out on their own
  const [, tick] = useState(0);
  useEffect(() => {
    if (typingUntil <= Date.now()) return;
    const timer = setTimeout(() => tick(n => n + 1), typingUntil - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [typingUntil]);
  const typing = typingUntil > Date.now();

  // Oldest first: pages come newest first, each newest first
  const messages = useMemo(() => {
    const loaded = (thread.data?.pages ?? []).flatMap(p => p.messages).reverse();
    const ids = new Set(loaded.map(m => m.id));
    const all = [...loaded, ...live.filter(m => !ids.has(m.id))];
    return all.map(m => (removed.has(m.id) ? { ...m, removed: true, body: null } : m));
  }, [thread.data, live, removed]);

  const seenUpTo = seen?.id ?? first?.seenUpTo ?? null;
  const seenAt = seen?.at ?? first?.seenAt ?? null;

  const person = first?.person ?? null;
  const handle = person?.handle ?? null;
  const request = first?.folder === "REQUESTS" && !first.accepted;
  const linksOff = !!first?.linksOff;

  // May I write here? Refusals show as a notice in place of the composer
  const can = useQuery({
    ...trpc.messages.canMessage.queryOptions({ handle: handle ?? "" }),
    enabled: !!handle && !first?.blocked,
    staleTime: 15_000,
  });

  const sendBody = useCallback(
    async (body: string, key: string) => {
      try {
        const sent = await trpcClient.messages.send.mutate({
          conversationId,
          body,
          idempotencyKey: key,
        });
        setPending(current => current.filter(p => p.key !== key));
        if (sent.flagged) setFlagged(true);
        // The stream also delivers it; adding it here covers a slow or closed stream
        const message: LiveMessage = {
          id: sent.messageId,
          mine: true,
          removed: false,
          body,
          flagged: sent.flagged,
          createdAt: new Date().toISOString(),
        };
        emitLive({ type: "message.new", conversationId, folder: sent.folder, message });
        void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
        void can.refetch();
        if (pushAskDue()) setPushAsk(true);
      } catch (error) {
        setPending(current =>
          current.map(p =>
            p.key === key ? { ...p, failed: true, error: errorMessage(error, S.failed) } : p
          )
        );
      }
    },
    [conversationId, queryClient, can]
  );

  const send = (body: string) => {
    const key = newIdempotencyKey();
    setPending(current => [...current, { key, body, createdAt: new Date(), failed: false }]);
    void sendBody(body, key);
  };
  const retry = (p: Pending) => {
    setPending(current => current.map(x => (x.key === p.key ? { ...x, failed: false } : x)));
    void sendBody(p.body, p.key);
  };

  if (thread.isLoading) return skeleton ? <ThreadSkeleton /> : null;
  if (thread.isError || !first) {
    return (
      <div className="p-5">
        <Button variant="ghost" onClick={onBack} className="mb-3 lg:hidden">
          <ChevronLeft aria-hidden /> {S.backToInbox}
        </Button>
        <ErrorCard
          title={S.threadError}
          cause={errorMessage(thread.error, S.listErrorCause)}
          onRetry={() => void thread.refetch()}
        />
      </div>
    );
  }

  const name = person?.name || atHandle(person);
  const refusal = can.data && !can.data.allowed ? can.data : null;
  const waiting = can.data?.allowed && can.data.folder === "REQUESTS" && messages.some(m => m.mine);
  const lastMine = [...messages].reverse().find(m => m.mine && !m.removed);

  return (
    <article aria-labelledby="conversation-title" className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        page={first}
        name={name}
        onBack={onBack}
        onGone={onGone}
        onChanged={() => {
          void thread.refetch();
          void can.refetch();
          void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
        }}
      />

      <MessageList
        messages={messages}
        pending={pending}
        linksOff={linksOff}
        seenUpTo={seenUpTo}
        seenAt={seenAt}
        lastMineId={lastMine?.id ?? null}
        typing={typing ? name : null}
        hasOlder={!!thread.hasNextPage}
        loadingOlder={thread.isFetchingNextPage}
        onOlder={() => void thread.fetchNextPage()}
        onRetry={retry}
        onUnsent={id => setRemoved(current => new Set(current).add(id))}
      />

      <div className="space-y-[13px] border-t border-prism-line p-[13px]">
        {request && handle && (
          <RequestBar
            conversationId={conversationId}
            handle={handle}
            onAccepted={() => {
              void thread.refetch();
              void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
            }}
            onGone={onGone}
          />
        )}
        {flagged && <Notice variant="warning">{S.financialWarning}</Notice>}
        {pushAsk && <PushAsk onDone={() => setPushAsk(false)} />}
        {first.deletedAccount ? (
          <Notice>{S.deletedAccount}</Notice>
        ) : first.blocked ? (
          <Notice>{S.blockedYou}</Notice>
        ) : refusal ? (
          <Refusal refusal={refusal} handle={handle} onFollowed={() => void can.refetch()} />
        ) : (
          <>
            {waiting && handle && (
              <p className="text-prism-meta text-prism-ink-2">{S.waitingAccept(handle)}</p>
            )}
            <Composer conversationId={conversationId} handle={handle ?? name} onSend={send} />
          </>
        )}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ header

function ConversationHeader({
  page,
  name,
  onBack,
  onGone,
  onChanged,
}: {
  page: Page;
  name: string;
  onBack: () => void;
  onGone: () => void;
  onChanged: () => void;
}) {
  const person = page.person;
  const handle = person?.handle ?? null;
  const [dialog, setDialog] = useState<"block" | "clear" | "report" | null>(null);
  const act = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: onChanged,
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.saveFailed) }),
  });
  const id = page.conversationId;
  const pageUrl = handle && LANDING ? `${LANDING}/${formatHandle(handle)}` : null;

  return (
    <header className="flex items-center gap-3 border-b border-prism-line p-[13px]">
      <button
        type="button"
        onClick={onBack}
        aria-label={S.backToInbox}
        className="prism-icon-btn prism-focus shrink-0 lg:hidden"
      >
        <ChevronLeft aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
      </button>
      <PersonAvatar person={person} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2
            id="conversation-title"
            className="truncate text-prism-label font-bold text-prism-ink"
          >
            {name}
          </h2>
          <RelationLabel relation={page.relation} className="max-sm:hidden" />
        </div>
        {handle &&
          (pageUrl ? (
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="prism-focus block truncate rounded-prism-5 text-prism-meta text-prism-ink-2 hover:underline"
            >
              @{handle}
            </a>
          ) : (
            <span className="block truncate text-prism-meta text-prism-ink-2">@{handle}</span>
          ))}
      </div>
      <Menu>
        <MenuTrigger aria-label={S.menu.label} className="prism-icon-btn prism-focus shrink-0">
          <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
        </MenuTrigger>
        <MenuContent align="end">
          {pageUrl && (
            <MenuItem onSelect={() => window.open(pageUrl, "_blank", "noopener,noreferrer")}>
              {S.menu.viewPage}
            </MenuItem>
          )}
          {page.muted ? (
            <MenuItem
              onSelect={() =>
                act.mutate(() => trpcClient.messages.unmute.mutate({ conversationId: id }))
              }
            >
              {S.menu.unmute}
            </MenuItem>
          ) : (
            <MenuSub>
              <MenuSubTrigger>{S.muted}</MenuSubTrigger>
              <MenuSubContent>
                {([8, 168, null] as const).map(hours => (
                  <MenuItem
                    key={String(hours)}
                    onSelect={() =>
                      act.mutate(() =>
                        trpcClient.messages.mute.mutate({ conversationId: id, hours })
                      )
                    }
                  >
                    {hours === 8 ? S.menu.mute8 : hours === 168 ? S.menu.mute7 : S.menu.muteAlways}
                  </MenuItem>
                ))}
              </MenuSubContent>
            </MenuSub>
          )}
          {page.folder === "PRIMARY" && (
            <MenuItem
              onSelect={() =>
                act.mutate(() =>
                  trpcClient.messages.archive.mutate({
                    conversationId: id,
                    archived: !page.archived,
                  })
                )
              }
            >
              {page.archived ? S.menu.unarchive : S.menu.archive}
            </MenuItem>
          )}
          <MenuItem onSelect={() => setDialog("clear")}>{S.menu.clear}</MenuItem>
          <MenuSeparator />
          {page.blocked ? (
            <MenuItem
              onSelect={() =>
                act.mutate(() => trpcClient.messages.unblock.mutate({ conversationId: id }))
              }
            >
              {S.menu.unblock}
            </MenuItem>
          ) : (
            <MenuItem destructive onSelect={() => setDialog("block")}>
              {S.menu.block}
            </MenuItem>
          )}
          <MenuItem destructive onSelect={() => setDialog("report")}>
            {S.menu.report}
          </MenuItem>
        </MenuContent>
      </Menu>

      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={open => !open && setDialog(null)}
        title={S.blockTitle(handle ?? name)}
        body={S.blockBody}
        confirm={S.menu.block}
        destructive
        onConfirm={async () => {
          await trpcClient.messages.block.mutate({ conversationId: id });
          onChanged();
          if (page.folder === "REQUESTS") onGone();
        }}
      />
      <ConfirmDialog
        open={dialog === "clear"}
        onOpenChange={open => !open && setDialog(null)}
        title={S.clearTitle}
        body={S.clearBody}
        confirm={S.menu.clear}
        destructive
        onConfirm={async () => {
          await trpcClient.messages.clear.mutate({ conversationId: id });
          onChanged();
        }}
      />
      <ReportDialog
        open={dialog === "report"}
        onOpenChange={open => !open && setDialog(null)}
        conversationId={id}
        onReported={alsoBlock => {
          onChanged();
          if (alsoBlock && page.folder === "REQUESTS") onGone();
        }}
      />
    </header>
  );
}

// ------------------------------------------------------------------ messages

function MessageList({
  messages,
  pending,
  linksOff,
  seenUpTo,
  seenAt,
  lastMineId,
  typing,
  hasOlder,
  loadingOlder,
  onOlder,
  onRetry,
  onUnsent,
}: {
  messages: LiveMessage[];
  pending: Pending[];
  linksOff: boolean;
  seenUpTo: string | null;
  seenAt: string | Date | null;
  lastMineId: string | null;
  typing: string | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onOlder: () => void;
  onRetry: (p: Pending) => void;
  onUnsent: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const count = messages.length + pending.length + (typing ? 1 : 0);

  // Stay at the bottom while the reader is there; loading older keeps the place
  const lastHeight = useRef(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (lastHeight.current && el.scrollHeight > lastHeight.current && el.scrollTop < 80) {
      el.scrollTop += el.scrollHeight - lastHeight.current;
    }
    lastHeight.current = el.scrollHeight;
  }, [count]);

  // The receipt sits under my last message once the other side read up to it
  const seenLast = !!(lastMineId && seenUpTo && seenUpTo >= lastMineId);

  return (
    <div
      ref={scroller}
      onScroll={e => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-[13px] py-[21px]"
    >
      {hasOlder && (
        <div className="mb-3 flex justify-center">
          <Button variant="secondary" onClick={onOlder} disabled={loadingOlder}>
            {loadingOlder ? S.sending : S.showOlder}
          </Button>
        </div>
      )}
      <ol aria-label="Messages" aria-live="polite" className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const tail =
            !next || next.mine !== m.mine || dayKey(next.createdAt) !== dayKey(m.createdAt);
          return (
            <li key={m.id} className="flex flex-col">
              {newDay && <DayLabel>{dayLabel(m.createdAt)}</DayLabel>}
              <Bubble
                message={m}
                tail={tail}
                linksOff={linksOff && !m.mine}
                onUnsent={onUnsent}
                spacedTop={!!prev && prev.mine !== m.mine && !newDay}
              />
              {m.id === lastMineId && seenLast && seenAt && (
                <p className="mt-1 self-end text-prism-meta text-prism-ink-2">
                  {S.seen(clock(seenAt))}
                </p>
              )}
            </li>
          );
        })}
        {pending.map(p => (
          <li key={p.key} className="flex flex-col items-end">
            <MessageBubble mine tail className={cn(!p.failed && "opacity-70")}>
              {p.body}
            </MessageBubble>
            <p
              className={cn(
                "mt-1 flex items-center gap-2 text-prism-meta",
                p.failed ? "text-prism-danger" : "text-prism-ink-2"
              )}
            >
              {p.failed ? (
                <>
                  {p.error ?? S.failed}
                  <Button variant="link" onClick={() => onRetry(p)} className="min-h-touch">
                    {S.retry}
                  </Button>
                </>
              ) : (
                S.sending
              )}
            </p>
          </li>
        ))}
        {typing && (
          <li className="mt-2">
            <TypingIndicator label={S.typing(typing)} />
          </li>
        )}
      </ol>
    </div>
  );
}

function Bubble({
  message,
  tail,
  linksOff,
  spacedTop,
  onUnsent,
}: {
  message: LiveMessage;
  tail: boolean;
  linksOff: boolean;
  spacedTop: boolean;
  onUnsent: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  // Touch screens have no hover: a tap on the bubble shows its actions
  const [actions, setActions] = useState(false);
  const sentAt = new Date(message.createdAt).getTime();
  const canUnsend =
    message.mine &&
    !message.removed &&
    Date.now() - sentAt < MESSAGE_LIMITS.unsendWindowMinutes * 60_000;
  const time = clock(message.createdAt);
  const copy = () => {
    if (!message.body) return;
    navigator.clipboard
      ?.writeText(message.body)
      .then(() => toast.add({ type: "success", title: S.copied }))
      .catch(() => undefined);
  };

  return (
    <div
      className={cn(
        "group flex w-full items-end gap-1",
        message.mine && "flex-row-reverse",
        spacedTop && "mt-3"
      )}
    >
      <MessageBubble
        mine={message.mine}
        tail={tail}
        removed={message.removed}
        onClick={() => setActions(a => !a)}
      >
        {message.removed ? (
          S.removed
        ) : (
          <MessageText text={message.body ?? ""} linksOff={linksOff} mine={message.mine} />
        )}
        <span className="sr-only">, {time}</span>
      </MessageBubble>
      {!message.removed && (
        <Menu>
          <MenuTrigger
            aria-label={`Message actions, ${time}`}
            className={cn(
              "prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-full transition-opacity duration-prism-hover focus-visible:opacity-100 group-hover:opacity-100",
              actions ? "opacity-100" : "opacity-0"
            )}
          >
            <MoreHorizontal aria-hidden className="h-5 w-5 text-prism-ink-3" />
          </MenuTrigger>
          <MenuContent align={message.mine ? "end" : "start"}>
            <MenuItem disabled>{time}</MenuItem>
            <MenuItem onSelect={copy}>{S.menu.copy}</MenuItem>
            {canUnsend && (
              <MenuItem destructive onSelect={() => setConfirm(true)}>
                {S.menu.unsend}
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={S.unsendTitle}
        body={S.unsendBody}
        confirm={S.menu.unsend}
        destructive
        onConfirm={async () => {
          await trpcClient.messages.unsend.mutate({ messageId: message.id });
          onUnsent(message.id);
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ composer

const DRAFT_KEY = (id: string) => `amped:draft:${id}`;
function readDraft(id: string) {
  try {
    return sessionStorage.getItem(DRAFT_KEY(id)) ?? "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, text: string) {
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY(id), text);
    else sessionStorage.removeItem(DRAFT_KEY(id));
  } catch {
    // Drafts are a convenience
  }
}

export function Composer({
  conversationId,
  handle,
  onSend,
  autoFocus = false,
}: {
  conversationId: string | null;
  handle: string;
  onSend: (body: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(() => (conversationId ? readDraft(conversationId) : ""));
  const [online, setOnline] = useState(() => navigator.onLine);
  const area = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);

  useEffect(() => {
    setText(conversationId ? readDraft(conversationId) : "");
  }, [conversationId]);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Grow to 6 lines, then scroll
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 24 * 6 + 24)}px`;
  }, [text]);

  const trimmed = text.trim();
  const over = text.length > MESSAGE_LIMITS.bodyMax;
  const left = MESSAGE_LIMITS.bodyMax - text.length;
  const showCount = text.length >= MESSAGE_LIMITS.bodyCountFrom;
  const canSend = trimmed.length > 0 && !over && online;
  const countId = `composer-count-${conversationId ?? "new"}`;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText("");
    if (conversationId) writeDraft(conversationId, "");
    area.current?.focus();
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      {!online && <Notice>{S.offline}</Notice>}
      <div className="flex items-end gap-[13px]">
        <div className="prism-well flex min-w-0 flex-1 rounded-prism-21 px-4 py-[13px]">
          <label htmlFor={`composer-${conversationId ?? "new"}`} className="sr-only">
            {S.composerLabel(handle.replace(/^@/, ""))}
          </label>
          <textarea
            id={`composer-${conversationId ?? "new"}`}
            ref={area}
            rows={1}
            autoFocus={autoFocus}
            value={text}
            placeholder={S.composerPlaceholder}
            aria-describedby={showCount ? countId : undefined}
            aria-invalid={over || undefined}
            onChange={e => {
              setText(e.target.value);
              if (conversationId) {
                writeDraft(conversationId, e.target.value);
                const now = Date.now();
                if (
                  e.target.value &&
                  now - lastTyping.current > MESSAGE_LIMITS.typingEverySeconds * 1000
                ) {
                  lastTyping.current = now;
                  void trpcClient.realtime.typing.mutate({ conversationId }).catch(() => undefined);
                }
              }
            }}
            onKeyDown={e => {
              // Enter sends on a keyboard; Shift Enter breaks a line. Phones keep Enter as a line break.
              const coarse = window.matchMedia?.("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            className="block max-h-[168px] min-h-6 w-full resize-none bg-transparent text-[16px] leading-6 text-prism-ink outline-none placeholder:text-prism-ink-3"
          />
        </div>
        <button
          type="submit"
          aria-label={S.send}
          disabled={!canSend}
          className={cn(
            "prism-focus flex h-commit w-commit shrink-0 items-center justify-center rounded-full transition-colors duration-prism-hover ease-prism",
            canSend
              ? "bg-prism-nav text-white hover:bg-prism-nav-hover"
              : "border-[1.5px] border-dashed border-prism-line-strong text-prism-ink-3"
          )}
        >
          <ArrowUp aria-hidden className="h-[21px] w-[21px]" strokeWidth={2} />
        </button>
      </div>
      {showCount && (
        <p
          id={countId}
          aria-live="polite"
          className={cn(
            "text-right text-prism-meta tabular-nums",
            over ? "font-semibold text-prism-danger" : "text-prism-ink-2"
          )}
        >
          {S.charsLeft(left)}
        </p>
      )}
    </form>
  );
}

// ------------------------------------------------------------------ request and refusal

function RequestBar({
  conversationId,
  handle,
  onAccepted,
  onGone,
}: {
  conversationId: string;
  handle: string;
  onAccepted: () => void;
  onGone: () => void;
}) {
  const [dialog, setDialog] = useState<"delete" | "block" | "report" | null>(null);
  const accept = useMutation({
    mutationFn: () => trpcClient.messages.accept.mutate({ conversationId }),
    onSuccess: onAccepted,
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.saveFailed) }),
  });
  return (
    <div className="space-y-[13px]">
      <Notice>{S.requestNotice(handle)}</Notice>
      <div className="flex flex-wrap gap-[13px]">
        <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
          {S.accept}
        </Button>
        <Button variant="secondary" onClick={() => setDialog("delete")}>
          {S.delete}
        </Button>
        <Button variant="ghost" onClick={() => setDialog("block")}>
          {S.menu.block}
        </Button>
        <Button variant="ghost" onClick={() => setDialog("report")}>
          {S.menu.report}
        </Button>
      </div>
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={open => !open && setDialog(null)}
        title={S.deleteRequestTitle}
        body={S.deleteRequestBody(handle)}
        confirm={S.delete}
        destructive
        onConfirm={async () => {
          await trpcClient.messages.deleteRequest.mutate({ conversationId });
          onGone();
        }}
      />
      <ConfirmDialog
        open={dialog === "block"}
        onOpenChange={open => !open && setDialog(null)}
        title={S.blockTitle(handle)}
        body={S.blockBody}
        confirm={S.menu.block}
        destructive
        onConfirm={async () => {
          await trpcClient.messages.block.mutate({ conversationId });
          onGone();
        }}
      />
      <ReportDialog
        open={dialog === "report"}
        onOpenChange={open => !open && setDialog(null)}
        conversationId={conversationId}
        onReported={alsoBlock => alsoBlock && onGone()}
      />
    </div>
  );
}

export function Refusal({
  refusal,
  handle,
  onFollowed,
}: {
  refusal: { reason: string; message: string };
  handle: string | null;
  onFollowed: () => void;
}) {
  const follow = useMutation({
    mutationFn: () => trpcClient.follow.follow.mutate({ handle: handle! }),
    onSuccess: onFollowed,
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.saveFailed) }),
  });
  const warning = refusal.reason === "sender_cap" || refusal.reason === "sender_paused";
  return (
    <Notice variant={warning ? "warning" : "info"}>
      <p>{refusal.message}</p>
      {refusal.reason === "not_follower" && handle && (
        <Button className="mt-[13px]" onClick={() => follow.mutate()} disabled={follow.isPending}>
          {S.refusalFollow}
        </Button>
      )}
    </Notice>
  );
}

function ThreadSkeleton() {
  return (
    <div aria-busy aria-label="Loading conversation" className="space-y-4 p-[21px]">
      <div className="flex items-center gap-3">
        <Skeleton className="h-touch w-touch rounded-full" />
        <Skeleton className="h-4 w-40 rounded-full" />
      </div>
      {[60, 40, 70, 30].map((w, i) => (
        <Skeleton
          key={i}
          className={cn("h-10 rounded-[21px]", i % 2 ? "ml-auto" : "")}
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
