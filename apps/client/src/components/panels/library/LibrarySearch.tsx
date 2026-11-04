/**
 * Library search (Build Board #26, FL-3, row 183; boards m2, fl-q7). Scope chips
 * (All creators, or the creator the fan came from), results grouped by creator,
 * recent searches, and a no results state. On this device joins with Downloads
 * in FL-5. Searches titles and descriptions of items the fan can open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { Clock, Search, SearchX, X } from "lucide-react";
import { LIBRARY_LIMITS, type LibrarySearchGroup } from "@repo/constants";
import { Button, Chip, EmptyState, ErrorCard, trpc, useAuth } from "@repo/ui";
import { useDebounce } from "@/hooks/useDebounce";
import { useDelayed } from "@/hooks/useDelayed";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { ItemMenu } from "./ItemMenu";
import { CreatorAvatar, ItemListSkeleton, ItemRow, ownerName } from "./parts";

const C = LIBRARY_COPY;
const S = C.searchPage;
const RECENT_MAX = 8;

/** Recent searches stay in this browser, per account. Storage may be blocked. */
function recentKey(userId: string | number | undefined) {
  return `amped.library.recent.${userId ?? "anon"}`;
}
export function readRecent(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}
export function pushRecent(list: string[], term: string) {
  const clean = term.trim();
  if (!clean) return list;
  return [clean, ...list.filter(v => v.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_MAX);
}
function writeRecent(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Private windows and blocked storage: recent searches simply do not stay
  }
}

/** Pages can split one creator's results; join them in first seen order. */
export function mergeGroups(pages: Array<{ groups: LibrarySearchGroup[] }>) {
  const groups = new Map<string, LibrarySearchGroup>();
  for (const page of pages) {
    for (const group of page.groups) {
      const known = groups.get(group.owner.handle);
      if (known) known.items.push(...group.items);
      else groups.set(group.owner.handle, { owner: group.owner, items: [...group.items] });
    }
  }
  return [...groups.values()];
}

export function LibrarySearch() {
  const navigate = useNavigate();
  const { authUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromHandle = params.get("handle");
  const scope: "all" | "creator" =
    params.get("scope") === "creator" && fromHandle ? "creator" : "all";
  const [query, setQuery] = useState(params.get("q") ?? "");
  const debounced = useDebounce(query.trim(), 300);
  const searching = debounced.length >= LIBRARY_LIMITS.searchMinLength;
  const storageKey = recentKey(authUser?.id);
  const [recent, setRecent] = useState<string[]>(() => readRecent(storageKey));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useInfiniteQuery({
    ...trpc.library.search.infiniteQueryOptions(
      {
        q: debounced,
        scope,
        handle: scope === "creator" ? (fromHandle ?? undefined) : undefined,
      },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    ),
    enabled: searching,
  });
  const groups = useMemo(() => mergeGroups(results.data?.pages ?? []), [results.data]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const skeleton = useDelayed(results.isLoading && searching, 400);

  // A search that found something is worth remembering
  useEffect(() => {
    if (!searching || !results.isSuccess || count === 0) return;
    setRecent(list => {
      const next = pushRecent(list, debounced);
      writeRecent(storageKey, next);
      return next;
    });
  }, [searching, results.isSuccess, count, debounced, storageKey]);

  const setScope = (next: "all" | "creator") => {
    const p = new URLSearchParams(params);
    p.set("scope", next);
    setParams(p, { replace: true });
  };

  let body: React.ReactNode;
  if (!searching) {
    body = recent.length ? (
      <section aria-labelledby="library-recent" className="space-y-1">
        <div className="flex min-h-touch items-center justify-between">
          <h2 id="library-recent" className="text-[20px] font-semibold text-prism-ink">
            {S.recent}
          </h2>
          <Button
            variant="ghost"
            onClick={() => {
              setRecent([]);
              writeRecent(storageKey, []);
            }}
          >
            {S.clearRecent}
          </Button>
        </div>
        <ul>
          {recent.map(term => (
            <li key={term}>
              <button
                type="button"
                onClick={() => setQuery(term)}
                className="prism-focus flex min-h-touch w-full items-center gap-3 rounded-prism-13 px-2 text-left text-[15px] text-prism-ink hover:bg-white/60"
              >
                <Clock
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-prism-ink-3"
                  strokeWidth={1.5}
                />
                <span className="truncate">{term}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : (
      <p className="py-6 text-center text-[15px] text-prism-ink-2">{S.hint}</p>
    );
  } else if (results.isLoading) {
    body = skeleton ? <ItemListSkeleton label={S.label} /> : null;
  } else if (results.isError) {
    body = (
      <ErrorCard
        title={C.error.title}
        cause={C.error.cause}
        onRetry={() => void results.refetch()}
      />
    );
  } else if (!groups.length) {
    body = (
      <EmptyState icon={SearchX} title={S.noResultsTitle(debounced)} description={S.noResults} />
    );
  } else {
    body = (
      <div className="space-y-[21px]">
        <p className="text-[14px] text-prism-ink-2" role="status">
          {S.results(count)}
        </p>
        {groups.map(group => (
          <section
            key={group.owner.handle}
            aria-label={ownerName(group.owner)}
            className="space-y-1"
          >
            <button
              type="button"
              onClick={() => navigate(LIBRARY_PATHS.creator(group.owner.handle))}
              className="prism-focus flex min-h-touch items-center gap-2 rounded-prism-13 pr-2 text-left"
            >
              <CreatorAvatar owner={group.owner} size={36} />
              <span className="font-prism text-[16px] font-semibold text-prism-ink">
                {ownerName(group.owner)}
              </span>
            </button>
            <ul className="space-y-1">
              {group.items.map(item => (
                <li key={item.publicId}>
                  <ItemRow
                    item={item}
                    onOpen={() =>
                      navigate(LIBRARY_PATHS.item(item.owner.handle, item.publicId), {
                        state: { savedAt: item.savedAt },
                      })
                    }
                    menu={<ItemMenu item={item} />}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {results.hasNextPage && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              onClick={() => void results.fetchNextPage()}
              disabled={results.isFetchingNextPage}
            >
              {results.isFetchingNextPage ? C.loadingMore : C.showMore}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <form
        role="search"
        onSubmit={event => event.preventDefault()}
        className="prism-well flex h-touch items-center gap-2 rounded-prism-13 px-3"
      >
        <Search aria-hidden className="h-5 w-5 shrink-0 text-prism-ink-3" strokeWidth={1.5} />
        <label htmlFor="library-search" className="sr-only">
          {S.label}
        </label>
        <input
          ref={inputRef}
          id="library-search"
          type="search"
          value={query}
          maxLength={LIBRARY_LIMITS.searchMaxLength}
          onChange={e => setQuery(e.target.value)}
          placeholder={S.placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={S.clear}
            className="prism-focus -mr-2 flex h-touch w-touch items-center justify-center rounded-full"
          >
            <X aria-hidden className="h-5 w-5 text-prism-ink-2" />
          </button>
        )}
      </form>
      {fromHandle && (
        <div role="group" aria-label={S.scope} className="flex flex-wrap gap-2">
          <Chip selected={scope === "all"} onClick={() => setScope("all")}>
            {S.all}
          </Chip>
          <Chip selected={scope === "creator"} onClick={() => setScope("creator")}>
            @{fromHandle}
          </Chip>
        </div>
      )}
      {body}
    </div>
  );
}
