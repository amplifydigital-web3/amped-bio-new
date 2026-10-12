import { useCallback, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { MessageCircle } from "lucide-react";
import { TELEGRAM_APP_STRINGS as S } from "@repo/constants";
import { Button, Chip, EmptyState, ErrorCard, cn, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { Avatar } from "../broadcast/shared";
import { shortTime } from "../broadcast/utils";
import { useOpenTelegramWizard } from "./shared";
import { ThreadView, type ThreadSide } from "./ThreadView";

type Filter = "all" | "unread" | "blocked" | "sent";

type Row = {
  id: string;
  name: string;
  avatar: string | null;
  badge: string | null;
  preview: string;
  at: string | Date | null;
  unread: boolean;
  closed: boolean;
};

/**
 * Inbox, Messages (Screen Review 113, board tg2). Conversations fans started with
 * you, filtered All, Unread or Blocked, and To creators: the ones you started.
 * Deep link /inbox?t={threadId} (the bot's Open thread button); `side=fan` opens
 * your side of a conversation with a creator. A link without a side tries the
 * creator side first, then the fan side.
 */
export function MessagesTab() {
  const [params, setParams] = useSearchParams();
  const openWizard = useOpenTelegramWizard();
  const openId = params.get("t");
  const sideParam = params.get("side") === "fan" ? "fan" : null;
  const [guessedSide, setGuessedSide] = useState<ThreadSide>("creator");
  const side: ThreadSide = sideParam ?? guessedSide;
  const [filter, setFilter] = useState<Filter>(sideParam === "fan" ? "sent" : "all");

  const setOpen = (id: string | null, nextSide: ThreadSide = "creator") =>
    setParams(current => {
      const next = new URLSearchParams(current);
      if (id === null) {
        next.delete("t");
        next.delete("side");
      } else {
        next.set("t", id);
        if (nextSide === "fan") next.set("side", "fan");
        else next.delete("side");
      }
      return next;
    });
  const onWrongSide = useCallback(() => {
    if (!sideParam && guessedSide === "creator") setGuessedSide("fan");
  }, [sideParam, guessedSide]);

  const creatorList = useInfiniteQuery({
    ...trpc.messaging.creator.listThreads.infiniteQueryOptions(
      { filter: filter === "sent" ? "all" : filter },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    ),
    enabled: filter !== "sent",
  });
  const fanList = useInfiniteQuery({
    ...trpc.messaging.fan.listThreads.infiniteQueryOptions(
      {},
      { getNextPageParam: last => last.nextCursor ?? undefined }
    ),
    enabled: filter === "sent",
  });
  const list = filter === "sent" ? fanList : creatorList;
  const skeleton = useDelayed(list.isLoading, 400);

  const rows: Row[] =
    filter === "sent"
      ? (fanList.data?.pages.flatMap(p => p.items) ?? []).map(t => ({
          id: t.id,
          name: t.creator?.name ?? "Creator",
          avatar: t.creator?.avatarUrl ?? null,
          badge: null,
          preview: t.preview
            ? `${t.preview.sender === "FAN" ? S.youPrefix : ""}${t.preview.text}`
            : "",
          at: t.lastMessageAt,
          unread: t.unread > 0,
          closed: t.status !== "OPEN",
        }))
      : (creatorList.data?.pages.flatMap(p => p.items) ?? []).map(t => ({
          id: t.id,
          name: t.fan?.name ?? "Fan",
          avatar: t.fan?.avatarUrl ?? null,
          badge: t.fan?.relationLabel ?? null,
          preview: t.preview
            ? `${t.preview.sender === "CREATOR" ? S.youPrefix : ""}${t.preview.text}`
            : "",
          at: t.lastMessageAt,
          unread: t.unread > 0,
          closed: t.status !== "OPEN",
        }));

  const chips = (
    <div
      role="group"
      aria-label="Filter conversations"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1"
    >
      {(["all", "unread", "blocked", "sent"] as const).map(value => (
        <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>
          {S.messagesFilters[value]}
        </Chip>
      ))}
    </div>
  );

  let listBody: React.ReactNode;
  if (list.isLoading) {
    listBody = skeleton ? (
      <div aria-hidden className="h-80 rounded-prism-21 bg-prism-line/60" />
    ) : null;
  } else if (list.isError) {
    listBody = (
      <ErrorCard
        title={S.listLoadError}
        cause="Try again in a moment."
        onRetry={() => void list.refetch()}
      />
    );
  } else if (rows.length === 0) {
    listBody =
      filter === "all" ? (
        <EmptyState
          icon={MessageCircle}
          title={S.messagesEmptyTitle}
          description={S.inboxEmpty.body}
          action={
            <Button variant="secondary" onClick={openWizard}>
              {S.inboxEmpty.button}
            </Button>
          }
        />
      ) : filter === "sent" ? (
        <EmptyState
          icon={MessageCircle}
          title={S.filterEmptyTitle}
          description={S.fanThreadsEmpty}
        />
      ) : (
        <EmptyState
          icon={MessageCircle}
          title={S.filterEmptyTitle}
          description={S.messagesFilterEmpty}
        />
      );
  } else {
    const rowSide: ThreadSide = filter === "sent" ? "fan" : "creator";
    listBody = (
      <ul
        aria-label="Conversations"
        className="prism-slab divide-y divide-prism-line overflow-hidden rounded-prism-21"
      >
        {rows.map(row => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => setOpen(row.id, rowSide)}
              aria-current={openId === row.id ? "true" : undefined}
              className={cn(
                "prism-focus flex w-full items-start gap-3 px-4 py-4 text-left",
                openId === row.id ? "bg-prism-nav-tint" : "hover:bg-white/50"
              )}
            >
              <Avatar name={row.name} src={row.avatar} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate text-prism-label text-prism-ink",
                      row.unread ? "font-bold" : "font-semibold"
                    )}
                  >
                    {row.name}
                  </span>
                  {row.badge && (
                    <span className="shrink-0 rounded-full bg-prism-nav-tint px-2 text-prism-meta font-semibold text-prism-nav">
                      {row.badge}
                    </span>
                  )}
                  {row.at && (
                    <span className="ml-auto shrink-0 text-prism-meta text-prism-ink-2">
                      {shortTime(row.at)}
                    </span>
                  )}
                </span>
                <span className="block truncate text-prism-meta text-prism-ink-2">
                  {row.closed ? `${S.messagesFilters.blocked}. ` : ""}
                  {row.preview}
                </span>
              </span>
              {row.unread && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-prism-nav">
                  <span className="sr-only">Unread</span>
                </span>
              )}
            </button>
          </li>
        ))}
        {list.hasNextPage && (
          <li className="flex justify-center p-3">
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? "Loading…" : S.showOlder}
            </Button>
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className={cn("min-w-0 space-y-4", openId && "hidden lg:block")}>
        {chips}
        {listBody}
      </div>
      <div className={cn("min-w-0", !openId && "hidden lg:block")}>
        {openId ? (
          <ThreadView
            key={`${openId}:${side}`}
            threadId={openId}
            side={side}
            onBack={() => setOpen(null)}
            onWrongSide={sideParam ? undefined : onWrongSide}
          />
        ) : (
          rows.length > 0 && (
            <div className="prism-slab flex h-full min-h-60 items-center justify-center rounded-prism-21 p-5 text-prism-label text-prism-ink-2">
              {S.chooseThread}
            </div>
          )
        )}
      </div>
    </div>
  );
}
