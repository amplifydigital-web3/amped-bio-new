import React, { useEffect, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, ErrorCard, FirstFollowSheet, trpc } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import UserSkeleton from "./UserSkeleton";
import { PersonCard, PersonRow, type Person, type PersonActions } from "./PersonCard";

type UserFilter = "all" | "active-7-days" | "has-creator-pool";
type UserSort = "newest" | "name-asc" | "name-desc" | "most-followers";
export type UserView = "cards" | "rows";

// user.getUsers returns at most 20 per request (042 I07)
const PAGE_SIZE = 20;

interface UsersTabProps {
  searchQuery: string;
  userFilter: UserFilter;
  userSort: UserSort;
  // Explore person cards build: cards (concept A) or rows (concept E)
  view: UserView;
  // 045 I10: the result count beside Sort, and Searching while a new query loads.
  // null while there is no count to show (042: a failed request shows none).
  onResult?: (result: { count: number; fetching: boolean } | null) => void;
  // 045 I13: Clear search and Clear filter in the no results state
  emptyActions?: React.ReactNode;
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

const GRID =
  "grid grid-cols-1 gap-[13px] sm:grid-cols-[repeat(auto-fill,minmax(272px,1fr))] sm:gap-[21px]";
const ROWS = "prism-glass-clear px-[21px] py-1";

const UsersTab: React.FC<UsersTabProps> = ({
  searchQuery,
  userFilter,
  userSort,
  view,
  onResult,
  emptyActions,
}) => {
  const queryClient = useQueryClient();
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

  // ===== Follow from Explore (Fan Graph #22, source = explore) =====
  const follow = useMutation(trpc.follow.follow.mutationOptions());
  const unfollow = useMutation(trpc.follow.unfollow.mutationOptions());
  const undoUnfollow = useMutation(trpc.follow.undoUnfollow.mutationOptions());
  // The person whose first-follow sheet is open (decision 3: once, then one tap)
  const [sheetFor, setSheetFor] = useState<Person | null>(null);
  const busy = follow.isPending || unfollow.isPending || undoUnfollow.isPending;

  const setFollowing = (id: string, following: boolean, disclosureSeen?: boolean) => {
    setPeople(previous =>
      previous.map(person =>
        person.id === id && person.viewer
          ? {
              ...person,
              viewer: {
                ...person.viewer,
                following,
                disclosureSeen: disclosureSeen ?? person.viewer.disclosureSeen,
              },
            }
          : person
      )
    );
    // The disclosure is seen once for every card on the page
    if (disclosureSeen) {
      setPeople(previous =>
        previous.map(person =>
          person.viewer ? { ...person, viewer: { ...person.viewer, disclosureSeen: true } } : person
        )
      );
    }
    void queryClient.invalidateQueries({ queryKey: trpc.follow.listFollowing.queryKey() });
  };

  const doFollow = async (
    person: Person,
    choice?: { showPublicly: boolean; emailUpdates: boolean }
  ) => {
    try {
      const result = await follow.mutateAsync({
        handle: person.username,
        source: "explore",
        ...(choice ? { ...choice, fromDisclosure: true } : {}),
      });
      setSheetFor(null);
      setFollowing(person.id, true, choice ? true : undefined);
      toast.add({
        type: "success",
        title: `You follow ${person.displayName}.`,
        description: result.pending ? "It counts once you confirm your email." : undefined,
        duration: 8000,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void unfollow
              .mutateAsync({ handle: person.username })
              .then(() => setFollowing(person.id, false))
              .catch(() => toast.add({ type: "error", title: "That didn't work. Try again." }));
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.add({ type: "error", title: message || "That didn't work. Try again." });
    }
  };

  const actions: PersonActions = {
    busy,
    onFollow: person => {
      if (person.viewer?.disclosureSeen) void doFollow(person);
      else setSheetFor(person);
    },
    onUnfollow: async person => {
      try {
        const { restoreToken } = await unfollow.mutateAsync({ handle: person.username });
        setFollowing(person.id, false);
        toast.add({
          type: "success",
          title: `You unfollowed ${person.displayName}.`,
          duration: 8000,
          // Undo restores the follow as it was, with its settings and date (QA-033)
          actionProps: restoreToken
            ? {
                children: "Undo",
                onClick: () => {
                  void undoUnfollow
                    .mutateAsync({ token: restoreToken })
                    .then(() => setFollowing(person.id, true))
                    .catch(() =>
                      toast.add({ type: "error", title: "Undo is no longer available." })
                    );
                },
              }
            : undefined,
        });
      } catch {
        toast.add({ type: "error", title: "That didn't work. Try again." });
      }
    },
  };

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

  // 042 I08: nothing before 400ms, then 8 skeletons where the cards or rows land
  if (query.isLoading) {
    if (!showSkeleton) return null;
    return view === "rows" ? (
      <div className={ROWS} aria-busy aria-label="Loading people">
        {Array.from({ length: 8 }).map((_, index) => (
          <UserSkeleton key={index} view="rows" />
        ))}
      </div>
    ) : (
      <div className={GRID} aria-busy aria-label="Loading people">
        {Array.from({ length: 8 }).map((_, index) => (
          <UserSkeleton key={index} view="cards" />
        ))}
      </div>
    );
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
      {view === "rows" ? (
        <div role="list" aria-label="People" className={ROWS}>
          {people.map(person => (
            <div role="listitem" key={person.id}>
              <PersonRow person={person} actions={actions} />
            </div>
          ))}
        </div>
      ) : (
        <div role="list" aria-label="People" className={GRID}>
          {people.map(person => (
            <div role="listitem" key={person.id}>
              <PersonCard person={person} actions={actions} />
            </div>
          ))}
        </div>
      )}

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

      {/* First follow only (board fg3). The same sheet as the creator page capsule. */}
      {sheetFor && (
        <FirstFollowSheet
          key={sheetFor.id}
          open
          onOpenChange={open => {
            if (!open) setSheetFor(null);
          }}
          creatorName={sheetFor.displayName}
          showCount={sheetFor.showCount}
          busy={follow.isPending}
          privacyHref={`${import.meta.env.VITE_LANDINGPAGE_URL ?? ""}/privacy`}
          onConfirm={choice => void doFollow(sheetFor, choice)}
        />
      )}
    </div>
  );
};

export default UsersTab;
