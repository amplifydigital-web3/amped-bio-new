import React, { useEffect, useId, useState } from "react";
import { ExternalLink, Search, UsersRound } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorCard, trpc, type RouterOutputs } from "@repo/ui";
import UserSkeleton from "./UserSkeleton";

type UserFilter = "all" | "active-7-days" | "has-creator-pool";
type UserSort = "newest" | "name-asc" | "name-desc";
type Person = RouterOutputs["user"]["getUsers"]["users"][number];

// user.getUsers returns at most 20 per request (042 I07)
const PAGE_SIZE = 20;

interface UsersTabProps {
  searchQuery: string;
  userFilter: UserFilter;
  userSort: UserSort;
  // 045 I10: the result count beside Sort, and Searching while a new query loads.
  // null while there is no count to show (042: a failed request shows none).
  onResult?: (result: { count: number; fetching: boolean } | null) => void;
  // 045 I13: Clear search and Clear filter in the no results state
  emptyActions?: React.ReactNode;
}

function pageUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}`;
}

// Skeletons only after 400ms of loading (loading convention)
function useDelayed(active: boolean, ms = 400) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

/** 042 I05. 55 circle with a line ring; the first letter on the lens disc when there is no photo or it fails. */
function PersonAvatar({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false);
  const letter = (person.displayName.trim() || person.username || "?").charAt(0).toUpperCase();

  if (person.avatar && !failed) {
    return (
      <img
        src={person.avatar}
        alt=""
        onError={() => setFailed(true)}
        className="h-[55px] w-[55px] shrink-0 rounded-full object-cover shadow-[0_0_0_1px_rgba(22,21,43,0.10)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFFFFF_0%,#F1F0F9_100%)] text-prism-panel-title text-prism-nav-pressed shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]"
    >
      {letter}
    </span>
  );
}

/**
 * 042 I02, I03, I11. G1 clear medium card, 189 high: avatar, name, @handle and
 * a two line plain text bio. The whole card is one link to the person's page in
 * a new tab. Rest CLEAR, hover ILLUMINATED (top highlight, 144ms), press
 * REFRACTED (rim flash, 89ms), Prism focus ring.
 */
function PersonCard({ person }: { person: Person }) {
  const nameId = useId();
  const handle = person.username;
  // The server returns plain text (042 I06); collapse any leftover whitespace
  const bio = person.bio.replace(/\s+/g, " ").trim();

  return (
    <a
      href={pageUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View @${handle}'s page (opens in a new tab)`}
      aria-describedby={nameId}
      className="group prism-glass-clear prism-focus relative flex h-[189px] flex-col gap-[13px] p-[21px] font-prism"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.36)_0%,rgba(255,255,255,0)_40%)] opacity-0 transition-opacity duration-prism-hover ease-prism group-hover:opacity-100 motion-reduce:transition-none"
      />
      <span
        aria-hidden
        className="prism-rim opacity-0 transition-opacity duration-prism-micro ease-prism group-active:opacity-100 motion-reduce:transition-none"
      />
      <span className="relative flex items-center gap-[13px]">
        <PersonAvatar person={person} />
        <span className="min-w-0 flex-1">
          <span
            id={nameId}
            title={person.displayName}
            className="block truncate text-prism-label font-bold text-prism-ink"
          >
            {person.displayName}
          </span>
          <span className="block truncate text-prism-meta text-prism-ink-2">@{handle}</span>
        </span>
        <ExternalLink
          className="h-[21px] w-[21px] shrink-0 self-start text-prism-ink-2"
          aria-hidden
        />
      </span>
      {bio && <span className="relative line-clamp-2 text-prism-meta text-prism-ink-2">{bio}</span>}
    </a>
  );
}

const GRID =
  "grid grid-cols-1 gap-[13px] sm:grid-cols-[repeat(auto-fill,minmax(272px,1fr))] sm:gap-[21px]";

const UsersTab: React.FC<UsersTabProps> = ({
  searchQuery,
  userFilter,
  userSort,
  onResult,
  emptyActions,
}) => {
  // A new query starts again from the first page
  const queryKey = `${searchQuery}|${userFilter}|${userSort}`;
  const [paging, setPaging] = useState({ key: queryKey, page: 1 });
  const page = paging.key === queryKey ? paging.page : 1;
  const [people, setPeople] = useState<Person[]>([]);
  // The last known total, kept while a Show more request fails
  const [total, setTotal] = useState(0);

  const query = useQuery({
    ...trpc.user.getUsers.queryOptions({
      search: searchQuery,
      filter: userFilter,
      sort: userSort,
      page,
      limit: PAGE_SIZE,
    }),
    // Keep the current results on screen while a new query loads (045 I10)
    placeholderData: keepPreviousData,
  });
  const { data, isPlaceholderData, isFetching, isError } = query;

  // 042 I07: Show more appends the next 20 from the same query
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    setTotal(data.total ?? 0);
    setPeople(previous => {
      if (page === 1) return data.users;
      const seen = new Set(previous.map(person => person.id));
      return [...previous, ...data.users.filter(person => !seen.has(person.id))];
    });
  }, [data, isPlaceholderData, page]);

  // The count beside Sort; none while the request has failed (042 approved QA)
  useEffect(() => {
    if (isError && page === 1) {
      onResult?.(null);
      return;
    }
    if (!data) return;
    onResult?.({ count: data.total ?? 0, fetching: isFetching && isPlaceholderData && page === 1 });
  }, [data, isError, isFetching, isPlaceholderData, page, onResult]);

  const showSkeleton = useDelayed(query.isLoading);
  const appending = page > 1 && isPlaceholderData;

  // 042 I09: a failed request never reads as an empty community
  if (isError && page === 1) {
    return (
      <ErrorCard
        title="People did not load"
        cause="Check your connection and retry."
        retryLabel="Retry"
        onRetry={() => void query.refetch()}
        className="sm:max-w-[610px]"
      />
    );
  }

  // 042 I08: nothing before 400ms, then 8 skeleton cards where the cards land
  if (query.isLoading) {
    return showSkeleton ? (
      <div className={GRID} aria-busy aria-label="Loading people">
        {Array.from({ length: 8 }).map((_, index) => (
          <UserSkeleton key={index} />
        ))}
      </div>
    ) : null;
  }

  // 042 I09: no results for a query, or from a filter only
  if (data && !isPlaceholderData && page === 1 && data.users.length === 0) {
    const term = searchQuery.trim();
    const filtered = userFilter !== "all";
    return (
      <div className="prism-glass-clear mx-auto max-w-[610px]">
        <EmptyState
          icon={term || filtered ? Search : UsersRound}
          title={
            term
              ? `No people match '${term}'`
              : filtered
                ? "No people match this filter"
                : "No people yet"
          }
          description={term ? "Check the spelling or search by @handle." : undefined}
          action={term || filtered ? emptyActions : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-[34px]">
      <div role="list" aria-label="People" className={GRID}>
        {people.map(person => (
          <div role="listitem" key={person.id}>
            <PersonCard person={person} />
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="flex flex-col items-center gap-[13px]">
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            Showing {people.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}{" "}
            {total === 1 ? "person" : "people"}
          </p>
          {isError ? (
            <ErrorCard
              title="People did not load"
              cause="Check your connection and retry."
              retryLabel="Retry"
              onRetry={() => void query.refetch()}
              className="w-full sm:max-w-[610px]"
            />
          ) : (
            people.length < total && (
              <Button
                type="button"
                variant="secondary"
                disabled={appending}
                onClick={() => setPaging({ key: queryKey, page: page + 1 })}
                className="max-sm:w-full"
              >
                {appending ? "Loading" : "Show more"}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default UsersTab;
