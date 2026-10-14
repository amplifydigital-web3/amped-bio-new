import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowDownUp, Check, ChevronDown, LayoutGrid, Rows3, Search, X } from "lucide-react";
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTrigger,
  Button,
  ChipGroup,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@repo/ui";
import { useDebounce } from "@/hooks/useDebounce";
import UsersTab, { type UserView } from "./components/UsersTab";
import PoolsTab from "./components/PoolsTab";
import FollowingTab from "./components/FollowingTab";

// Fan Graph (#22): Explore, Following (decision 6)
const FAN_GRAPH = import.meta.env.VITE_FAN_GRAPH === "true";

// Screen Review 044 (D07): NFTs is not rendered. It returns as a tab of this
// container behind VITE_SHOW_NFTS (default off) once NFT data exists; until
// then old ?t=nfts and ?tab=nfts links open Users and the URL is rewritten.

// Screen Review 045 (D07, D08, D14). One control stack under the top bar:
// tabs (Users, Pools), a search well with the result count and Sort, then the
// filter chips. Each tab keeps its own query, filter and sort, written to the
// URL (?tab=, ?q=, ?filter=, ?sort=). The top bar title is the only h1.

type Tab = "users" | "pools" | "following";
type UserFilter = "all" | "active-7-days" | "has-creator-pool";
type PoolFilter = "all" | "no-fans" | "more-than-10-fans" | "more-than-10k-stake";
type UserSort = "newest" | "name-asc" | "name-desc" | "most-followers";
type PoolSort = "newest" | "name-asc" | "name-desc" | "most-fans" | "most-staked";

interface TabQuery<F extends string, S extends string> {
  q: string;
  filter: F;
  sort: S;
}

type Option<T extends string> = { value: T; label: string };

// 045 I07: Active this week renders only once user.getUsers applies the
// active-7-days filter on the server. Until then it is not offered.
const USER_FILTERS: Option<UserFilter>[] = [
  { value: "all", label: "All" },
  { value: "has-creator-pool", label: "Has a pool" },
];
const POOL_FILTERS: Option<PoolFilter>[] = [
  { value: "all", label: "All" },
  { value: "more-than-10-fans", label: "10+ fans" },
  { value: "more-than-10k-stake", label: "10,000+ tREVO staked" },
  { value: "no-fans", label: "No fans yet" },
];
// Explore person cards build: Most followers is a sort, never a rank (086 D3).
const USER_SORTS: Option<UserSort>[] = [
  { value: "newest", label: "Newest" },
  { value: "most-followers", label: "Most followers" },
  { value: "name-asc", label: "Name A to Z" },
  { value: "name-desc", label: "Name Z to A" },
];
// 086 D3: Most staked and Most fans are sort options only. No rank numbers,
// no Top labels, no rank by rate (pending counsel).
const POOL_SORTS: Option<PoolSort>[] = [
  { value: "most-fans", label: "Most fans" },
  { value: "most-staked", label: "Most staked" },
  { value: "newest", label: "Newest" },
  { value: "name-asc", label: "Name A to Z" },
  { value: "name-desc", label: "Name Z to A" },
];

const DEFAULTS = {
  users: { q: "", filter: "all", sort: "newest" } as TabQuery<UserFilter, UserSort>,
  pools: { q: "", filter: "all", sort: "most-fans" } as TabQuery<PoolFilter, PoolSort>,
};

// Explore person cards build: cards (concept A) or rows (concept E), kept in
// the URL as ?view=rows. Cards is the default and is not written.
const USER_VIEWS: Option<UserView>[] = [
  { value: "cards", label: "Cards" },
  { value: "rows", label: "Rows" },
];

const PLACEHOLDER: Record<Exclude<Tab, "following">, string> = {
  users: "Search people by name or @handle",
  pools: "Search pools or creators",
};
const SEARCH_LABEL: Record<Exclude<Tab, "following">, string> = {
  users: "Search people",
  pools: "Search pools",
};

function pick<T extends string>(options: Option<T>[], raw: string | null, fallback: T): T {
  return options.some(option => option.value === raw) ? (raw as T) : fallback;
}

function readTab(params: URLSearchParams, initialTab?: string): Tab {
  // A pool link (?pool=, legacy ?pa=) opens on the Pools tab (D27)
  if (params.get("pool") || params.get("pa")) return "pools";
  const raw = params.get("tab") ?? params.get("t") ?? initialTab;
  if (raw === "following" && FAN_GRAPH) return "following";
  if (raw === "pools") return "pools";
  // 044 I04: nfts, unknown and missing values land on Users (rewritten to ?tab=users)
  return "users";
}

/** Cards or rows for the Users tab. Two 44 icon buttons in one group; the chosen one is pressed. */
function ViewToggle({
  view,
  onChange,
  className = "",
}: {
  view: UserView;
  onChange: (view: UserView) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="View" className={`flex shrink-0 gap-1 ${className}`}>
      {USER_VIEWS.map(option => {
        const Icon = option.value === "rows" ? Rows3 : LayoutGrid;
        const selected = option.value === view;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`prism-icon-btn prism-focus ${selected ? "!bg-prism-nav text-white" : "text-prism-ink-2"}`}
          >
            <Icon className="h-[21px] w-[21px]" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function countText(tab: Exclude<Tab, "following">, count: number) {
  if (tab === "users")
    return `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"}`;
  return `${count.toLocaleString("en-US")} ${count === 1 ? "pool" : "pools"}`;
}

// 044 I04: nfts is not a tab while VITE_SHOW_NFTS is off
interface ExplorePageProps {
  initialTab?: "users" | "pools";
  onTabChange?: (tab: "users" | "pools") => void;
}

export default function ExplorePage({ initialTab, onTabChange }: ExplorePageProps) {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => readTab(params, initialTab));

  // Per tab state; the URL carries the active tab's values
  const [users, setUsers] = useState(() =>
    tab === "users"
      ? {
          q: params.get("q") ?? "",
          filter: pick(USER_FILTERS, params.get("filter"), DEFAULTS.users.filter),
          sort: pick(USER_SORTS, params.get("sort"), DEFAULTS.users.sort),
        }
      : DEFAULTS.users
  );
  const [pools, setPools] = useState(() =>
    tab === "pools"
      ? {
          q: params.get("q") ?? "",
          filter: pick(POOL_FILTERS, params.get("filter"), DEFAULTS.pools.filter),
          sort: pick(POOL_SORTS, params.get("sort"), DEFAULTS.pools.sort),
        }
      : DEFAULTS.pools
  );
  const [view, setView] = useState<UserView>(() => pick(USER_VIEWS, params.get("view"), "cards"));
  const current = tab === "pools" ? pools : users;
  // The search, sort and filter controls belong to Users and Pools only
  const searchTab: Exclude<Tab, "following"> = tab === "pools" ? "pools" : "users";
  const isFollowing = tab === "following";
  const [text, setText] = useState(current.q);
  const debounced = useDebounce(text, 300);
  const [result, setResult] = useState<{ count: number; fetching: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The field follows the tab: switching tabs shows that tab's own query
  useEffect(() => {
    setText(current.q);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Debounced text becomes the tab's query
  useEffect(() => {
    if (debounced === current.q) return;
    if (tab === "users") setUsers(state => ({ ...state, q: debounced }));
    else setPools(state => ({ ...state, q: debounced }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Write the active tab and its query to the URL; rewrite legacy ?t=
  useEffect(() => {
    setParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete("t");
        next.set("tab", tab);
        const defaults = DEFAULTS[searchTab];
        for (const key of ["q", "filter", "sort"] as const) {
          const value = current[key];
          if (!isFollowing && value && value !== defaults[key]) next.set(key, value);
          else next.delete(key);
        }
        if (tab === "users" && view !== "cards") next.set("view", view);
        else next.delete("view");
        return next;
      },
      { replace: true }
    );
  }, [tab, current, setParams, searchTab, isFollowing, view]);

  const changeTab = (next: string) => {
    if (next === "following" && FAN_GRAPH) {
      setTab("following");
      return;
    }
    const value = next === "pools" ? "pools" : "users";
    setTab(value);
    onTabChange?.(value);
  };

  const clearSearch = () => {
    setText("");
    if (tab === "users") setUsers(state => ({ ...state, q: "" }));
    else setPools(state => ({ ...state, q: "" }));
    searchRef.current?.focus();
  };
  const clearFilter = () => {
    if (tab === "users") setUsers(state => ({ ...state, filter: "all" }));
    else setPools(state => ({ ...state, filter: "all" }));
  };
  const setSort = (value: string) => {
    if (tab === "users") setUsers(state => ({ ...state, sort: value as UserSort }));
    else setPools(state => ({ ...state, sort: value as PoolSort }));
  };

  const sorts: Option<string>[] = tab === "pools" ? POOL_SORTS : USER_SORTS;
  const sortLabel = sorts.find(option => option.value === current.sort)?.label ?? "";

  // 045 I13: a no results state offers the reset that applies
  const emptyActions = (
    <div className="flex flex-wrap justify-center gap-2">
      {current.q && (
        <Button type="button" variant="ghost" onClick={clearSearch}>
          Clear search
        </Button>
      )}
      {current.filter !== "all" && (
        <Button type="button" variant="ghost" onClick={clearFilter}>
          Clear filter
        </Button>
      )}
    </div>
  );

  return (
    // 042: Explore sits on the room like the other restyled destinations. The
    // shell gives 13 at the sides on mobile; 8 more makes the 21 gutter.
    <div className="px-2 pb-[13px] font-prism md:px-0">
      <section aria-label="Find on Explore" className="space-y-[13px]">
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList aria-label="Explore sections" className="max-sm:w-full">
            <TabsTrigger value="users" className="max-sm:flex-1">
              Users
            </TabsTrigger>
            <TabsTrigger value="pools" className="max-sm:flex-1">
              Pools
            </TabsTrigger>
            {FAN_GRAPH && (
              <TabsTrigger value="following" className="max-sm:flex-1">
                Following
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {!isFollowing && (
          <>
            <div className="flex flex-col gap-[13px] pt-2 sm:flex-row sm:items-center">
              <div
                className={`prism-well flex h-touch min-w-0 flex-1 items-center gap-2 !rounded-prism-13 pl-3 ${
                  tab === "users" ? "sm:max-w-[610px]" : ""
                }`}
              >
                <Search className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" aria-hidden />
                <label htmlFor="explore-search" className="sr-only">
                  {SEARCH_LABEL[searchTab]}
                </label>
                <input
                  id="explore-search"
                  ref={searchRef}
                  type="search"
                  value={text}
                  placeholder={PLACEHOLDER[searchTab]}
                  onChange={event => setText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Escape" && text) {
                      event.preventDefault();
                      clearSearch();
                    }
                  }}
                  className="h-full min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink placeholder:text-prism-ink-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {text && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={clearSearch}
                    className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2"
                  >
                    <X className="h-[21px] w-[21px]" aria-hidden />
                  </button>
                )}
              </div>

              <div className="hidden items-center gap-[13px] sm:flex">
                <p
                  className="min-w-[89px] text-right text-prism-meta tabular-nums text-prism-ink-2"
                  aria-live="polite"
                >
                  {result && (result.fetching ? "Searching" : countText(searchTab, result.count))}
                </p>
                {tab === "users" && <ViewToggle view={view} onChange={setView} />}
                <Menu>
                  <MenuTrigger asChild>
                    <Button type="button" variant="secondary" className="shrink-0">
                      Sort: {sortLabel}
                      <ChevronDown aria-hidden />
                    </Button>
                  </MenuTrigger>
                  <MenuContent align="end" className="w-[233px]">
                    {sorts.map(option => (
                      <MenuItem key={option.value} onSelect={() => setSort(option.value)}>
                        <span className="flex-1">{option.label}</span>
                        {option.value === current.sort && <Check aria-hidden />}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              </div>
            </div>

            {/* Mobile: chips scroll on one line; count and a 44 Sort button pinned right */}
            <div className="flex items-center gap-2">
              <div className="-ml-[21px] min-w-0 flex-1 overflow-x-auto pl-[21px] sm:ml-0 sm:overflow-visible sm:pl-0">
                {tab === "users" ? (
                  <ChipGroup<UserFilter>
                    label="Filter people"
                    value={users.filter}
                    onChange={value => setUsers(state => ({ ...state, filter: value }))}
                    options={USER_FILTERS}
                    className="flex-nowrap sm:flex-wrap"
                  />
                ) : (
                  <ChipGroup<PoolFilter>
                    label="Filter pools"
                    value={pools.filter}
                    onChange={value => setPools(state => ({ ...state, filter: value }))}
                    options={POOL_FILTERS}
                    className="flex-nowrap sm:flex-wrap"
                  />
                )}
              </div>
              <p
                className="shrink-0 text-prism-meta tabular-nums text-prism-ink-2 sm:hidden"
                aria-hidden
              >
                {result && (result.fetching ? "Searching" : countText(searchTab, result.count))}
              </p>
              {tab === "users" && (
                <ViewToggle view={view} onChange={setView} className="sm:hidden" />
              )}
              <BottomSheet>
                <BottomSheetTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Sort: ${sortLabel}`}
                    className="prism-icon-btn prism-focus shrink-0 sm:hidden"
                  >
                    <ArrowDownUp className="h-[21px] w-[21px] text-prism-ink-2" aria-hidden />
                  </button>
                </BottomSheetTrigger>
                <BottomSheetContent title={tab === "pools" ? "Sort pools" : "Sort"}>
                  <div role="listbox" aria-label="Sort" className="space-y-1 pb-2">
                    {sorts.map(option => (
                      <BottomSheetClose asChild key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.value === current.sort}
                          onClick={() => setSort(option.value)}
                          className="prism-focus flex h-touch w-full items-center justify-between rounded-prism-13 px-3 text-left text-prism-label font-medium text-prism-ink hover:bg-white/60"
                        >
                          {option.label}
                          {option.value === current.sort && (
                            <Check className="h-[21px] w-[21px] text-prism-nav" aria-hidden />
                          )}
                        </button>
                      </BottomSheetClose>
                    ))}
                  </div>
                </BottomSheetContent>
              </BottomSheet>
            </div>
          </>
        )}
      </section>

      <div className="mt-[21px]">
        {isFollowing ? (
          <FollowingTab onExploreCreators={() => changeTab("users")} />
        ) : tab === "users" ? (
          <UsersTab
            searchQuery={users.q}
            userFilter={users.filter}
            userSort={users.sort}
            view={view}
            onResult={setResult}
            emptyActions={emptyActions}
          />
        ) : (
          <PoolsTab
            searchQuery={pools.q}
            poolFilter={pools.filter}
            poolSort={pools.sort}
            shouldOpenModal={true}
            onResult={setResult}
            emptyActions={emptyActions}
          />
        )}
      </div>
    </div>
  );
}
