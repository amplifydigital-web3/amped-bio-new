import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Archive, BellOff, Inbox, MessageCircle, Search, UserRoundPlus, X } from "lucide-react";
import { MESSAGE_UI } from "@repo/constants";
import {
  Button,
  Chip,
  EmptyState,
  ErrorCard,
  Skeleton,
  cn,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { CountBadge } from "@repo/ui";
import { PersonAvatar, RelationLabel } from "./parts";
import { atHandle, rowTime } from "./util";

type Row = RouterOutputs["messages"]["list"]["rows"][number];
export type ListFilter = "all" | "unread" | "poolFans" | "followers";
const FILTERS: ListFilter[] = ["all", "unread", "poolFans", "followers"];

/**
 * The Inbox list (spec 8.2 items 2 and 3, board m1): search well, filter chips, rows
 * with avatar, name, relation, preview, time and unread count. Primary or Requests.
 */
export function ConversationList({
  folder,
  openId,
  onOpen,
  onNewMessage,
  archived,
  onToggleArchived,
}: {
  folder: "PRIMARY" | "REQUESTS";
  openId: string | null;
  onOpen: (conversationId: string) => void;
  onNewMessage: () => void;
  archived: boolean;
  onToggleArchived: (next: boolean) => void;
}) {
  const S = MESSAGE_UI;
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  const term = query.trim();
  const searching = term.replace(/^@/, "").length >= 2;

  const list = useInfiniteQuery({
    ...trpc.messages.list.infiniteQueryOptions(
      { folder, archived: folder === "PRIMARY" && archived, filter },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    ),
  });
  const people = useQuery({
    ...trpc.messages.search.queryOptions({ q: term.replace(/^@/, "") }),
    enabled: searching,
    staleTime: 30_000,
  });
  const rows = useMemo(() => list.data?.pages.flatMap(p => p.rows) ?? [], [list.data]);
  // Message text is encrypted at rest: search it here, over the loaded previews
  const visible = useMemo(() => {
    if (!searching) return rows;
    const needle = term.toLowerCase().replace(/^@/, "");
    const hits = new Set((people.data ?? []).map(p => p.conversationId));
    return rows.filter(
      r =>
        hits.has(r.conversationId) ||
        r.person?.name.toLowerCase().includes(needle) ||
        r.person?.handle?.toLowerCase().includes(needle) ||
        (r.preview && "text" in r.preview && r.preview.text.toLowerCase().includes(needle))
    );
  }, [rows, people.data, searching, term]);
  const skeleton = useDelayed(list.isLoading, 400);

  let body: React.ReactNode;
  if (list.isLoading) {
    body = skeleton ? <ListSkeleton /> : null;
  } else if (list.isError) {
    body = (
      <ErrorCard
        title={S.listError}
        cause={S.listErrorCause}
        onRetry={() => void list.refetch()}
        className="m-[13px]"
      />
    );
  } else if (visible.length === 0) {
    body = searching ? (
      <p className="px-5 py-8 text-center text-prism-body text-prism-ink-2">
        {S.searchNoResults(term)}
      </p>
    ) : filter !== "all" ? (
      <EmptyState icon={Inbox} title={S.emptyFilterTitle} description={S.emptyFilter} />
    ) : folder === "REQUESTS" ? (
      <EmptyState icon={UserRoundPlus} title={S.emptyRequestsTitle} description={S.emptyRequests} />
    ) : archived ? (
      <EmptyState icon={Archive} title={S.emptyArchivedTitle} description={S.emptyArchived} />
    ) : (
      <EmptyState
        icon={MessageCircle}
        title={S.emptyPrimaryTitle}
        description={S.emptyPrimary}
        action={<Button onClick={onNewMessage}>{S.newMessage}</Button>}
      />
    );
  } else {
    body = (
      <ul aria-label={folder === "REQUESTS" ? S.tabs.requests : S.tabs.primary} className="p-2">
        {visible.map(row => (
          <li key={row.conversationId}>
            <ConversationRow
              row={row}
              current={row.conversationId === openId}
              onOpen={() => onOpen(row.conversationId)}
            />
          </li>
        ))}
        {list.hasNextPage && !searching && (
          <li className="flex justify-center p-3">
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? S.sending : S.showOlder}
            </Button>
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-[13px] p-[13px] pb-2">
        <div className="prism-well flex h-touch items-center gap-2 rounded-prism-13 px-3">
          <Search aria-hidden className="h-5 w-5 shrink-0 text-prism-ink-3" strokeWidth={1.5} />
          <label htmlFor={`inbox-search-${folder}`} className="sr-only">
            {S.searchLabel}
          </label>
          <input
            id={`inbox-search-${folder}`}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={S.searchPlaceholder}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="prism-focus -mr-2 flex h-touch w-touch items-center justify-center rounded-full"
            >
              <X aria-hidden className="h-5 w-5 text-prism-ink-2" />
            </button>
          )}
        </div>
        {folder === "PRIMARY" && (
          <div
            role="group"
            aria-label="Filter"
            className="-mx-[13px] flex gap-2 overflow-x-auto px-[13px] py-1 [scrollbar-width:none]"
          >
            {FILTERS.map(f => (
              <Chip
                key={f}
                selected={filter === f && !archived}
                onClick={() => {
                  onToggleArchived(false);
                  setFilter(f);
                }}
              >
                {S.filters[f]}
              </Chip>
            ))}
            <Chip
              selected={archived}
              onClick={() => {
                setFilter("all");
                onToggleArchived(!archived);
              }}
            >
              {S.showArchived}
            </Chip>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
}

function ConversationRow({
  row,
  current,
  onOpen,
}: {
  row: Row;
  current: boolean;
  onOpen: () => void;
}) {
  const S = MESSAGE_UI;
  const name = row.person?.name || atHandle(row.person);
  const preview = !row.preview
    ? ""
    : "removed" in row.preview
      ? S.removed
      : `${row.preview.mine ? `${S.you}: ` : ""}${row.preview.text}`;
  const unread = row.unread > 0;
  const label = [name, unread ? `${row.unread} unread` : null, row.muted ? S.muted : null]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={current ? "true" : undefined}
      aria-label={label}
      className={cn(
        "prism-focus flex w-full min-h-[72px] items-center gap-3 rounded-prism-13 px-3 py-2 text-left transition-colors duration-prism-hover ease-prism",
        current ? "bg-prism-nav-tint" : "hover:bg-white/60"
      )}
    >
      <PersonAvatar person={row.person} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-prism-label text-prism-ink",
              unread ? "font-bold" : "font-semibold"
            )}
          >
            {name}
          </span>
          <RelationLabel relation={row.relation} className="max-sm:hidden" />
          {row.muted && (
            <BellOff aria-hidden className="h-4 w-4 shrink-0 text-prism-ink-3" strokeWidth={1.5} />
          )}
          <span className="ml-auto shrink-0 text-prism-meta tabular-nums text-prism-ink-2">
            {row.lastMessageAt ? rowTime(row.lastMessageAt) : ""}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-prism-meta",
              unread ? "font-semibold text-prism-ink" : "text-prism-ink-2",
              row.preview && "removed" in row.preview && "italic"
            )}
          >
            {preview}
          </span>
          <CountBadge count={row.unread} />
        </span>
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy aria-label="Loading messages" className="space-y-2 p-2">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex h-[72px] items-center gap-3 px-3">
          <Skeleton className="h-touch w-touch rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-3/4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
