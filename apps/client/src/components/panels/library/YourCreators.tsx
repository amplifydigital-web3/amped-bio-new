/**
 * Your creators (Build Board #26, FL-3, row 180; boards m3, fl-q2, fl-q12-d2).
 * One row per connected creator: the avatar in a ring of their accent, how the
 * fan is connected, then one warning (past due) or a new count. Past due first,
 * then recent activity (the server orders). TESTNET_NOTICE sits at the foot
 * when a pool row is present (spec 3.8).
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AlertTriangle, ChevronRight, Search, UsersRound, X } from "lucide-react";
import { TESTNET_NOTICE, type LibraryCreatorRow } from "@repo/constants";
import { Button, EmptyState, ErrorCard, Skeleton, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { CreatorAvatar, ownerName } from "./parts";

const C = LIBRARY_COPY;

/** "Following, Pool fan": how the fan is connected, in a fixed order. */
export function connectionLine(row: Pick<LibraryCreatorRow, "connection">) {
  const c = row.connection;
  return [
    c.member && C.connection.member,
    c.purchases > 0 && C.connection.purchases(c.purchases),
    c.poolFan && C.connection.poolFan,
    c.following && C.connection.following,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CreatorRow({ row }: { row: LibraryCreatorRow }) {
  const navigate = useNavigate();
  const name = ownerName(row.owner);
  const line = connectionLine(row);
  const signal = row.pastDue ? C.pastDue : row.newCount > 0 ? C.newCount(row.newCount) : null;
  return (
    <button
      type="button"
      onClick={() => navigate(LIBRARY_PATHS.creator(row.owner.handle))}
      aria-label={[name, line, signal].filter(Boolean).join(", ")}
      className="prism-focus flex min-h-[64px] w-full items-center gap-3 rounded-prism-13 px-2 py-2 text-left transition-colors duration-prism-hover ease-prism hover:bg-white/60"
    >
      <CreatorAvatar owner={row.owner} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-prism text-[16px] font-semibold text-prism-ink">
          {name}
        </span>
        <span className="block truncate text-[14px] text-prism-ink-2">{line}</span>
      </span>
      {row.pastDue ? (
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-prism-warning-ink">
          <AlertTriangle aria-hidden className="h-4 w-4" />
          {C.pastDue}
        </span>
      ) : row.newCount > 0 ? (
        <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-prism-nav px-2 text-[13px] font-semibold tabular-nums text-white">
          {C.newCount(row.newCount)}
        </span>
      ) : null}
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-prism-ink-3" />
    </button>
  );
}

/** The testnet line under any list that shows a pool row. */
export function CreatorsFooter({ rows }: { rows: LibraryCreatorRow[] }) {
  if (!rows.some(row => row.connection.poolFan)) return null;
  return <p className="px-2 pt-2 text-[13px] text-prism-ink-2">{TESTNET_NOTICE}</p>;
}

/** The full page at /library/creators, with search by name or handle. */
export function YourCreatorsPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().replace(/^@/, "");
  const list = useInfiniteQuery(
    trpc.library.creators.infiniteQueryOptions(
      { q: q || undefined },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const rows = useMemo(() => list.data?.pages.flatMap(p => p.items) ?? [], [list.data]);
  const skeleton = useDelayed(list.isLoading, 400);

  let body: React.ReactNode;
  if (list.isLoading) {
    body = skeleton ? (
      <div aria-busy aria-label={C.creatorsTitle} className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-[64px] w-full rounded-prism-13" />
        ))}
      </div>
    ) : null;
  } else if (list.isError) {
    body = (
      <ErrorCard title={C.error.title} cause={C.error.cause} onRetry={() => void list.refetch()} />
    );
  } else if (!rows.length) {
    body = q ? (
      <p className="py-8 text-center text-[15px] text-prism-ink-2">{C.empty.creatorsSearch(q)}</p>
    ) : (
      <EmptyState icon={UsersRound} title={C.empty.creatorsTitle} description={C.empty.creators} />
    );
  } else {
    body = (
      <>
        <ul className="space-y-1">
          {rows.map(row => (
            <li key={row.owner.handle}>
              <CreatorRow row={row} />
            </li>
          ))}
        </ul>
        {list.hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? C.loadingMore : C.showMore}
            </Button>
          </div>
        )}
        <CreatorsFooter rows={rows} />
      </>
    );
  }

  return (
    <section aria-labelledby="library-creators-page" className="space-y-[13px]">
      <h2 id="library-creators-page" className="text-[20px] font-semibold text-prism-ink">
        {C.creatorsTitle}
      </h2>
      <div className="prism-well flex h-touch items-center gap-2 rounded-prism-13 px-3">
        <Search aria-hidden className="h-5 w-5 shrink-0 text-prism-ink-3" strokeWidth={1.5} />
        <label htmlFor="library-creators-search" className="sr-only">
          {C.creatorsPage.searchLabel}
        </label>
        <input
          id="library-creators-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={C.creatorsPage.placeholder}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={C.searchPage.clear}
            className="prism-focus -mr-2 flex h-touch w-touch items-center justify-center rounded-full"
          >
            <X aria-hidden className="h-5 w-5 text-prism-ink-2" />
          </button>
        )}
      </div>
      {body}
    </section>
  );
}
