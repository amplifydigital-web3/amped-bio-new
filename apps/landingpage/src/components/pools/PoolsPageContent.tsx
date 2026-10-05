"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  Button,
  ChipGroup,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Notice,
  TESTNET_NOTICE,
} from "@repo/ui";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import PoolsTab, { PoolFilter, PoolSort } from "@/components/pools/PoolsTab";
import type { PoolsPageData } from "@/lib/getPoolsData";

const FILTERS: { value: PoolFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "no-fans", label: "No fans yet" },
  { value: "more-than-10-fans", label: "10+ fans" },
  { value: "more-than-10k-stake", label: "10k+ tREVO staked" },
];

const SORTS: { value: PoolSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "name-asc", label: "Name A to Z" },
  { value: "name-desc", label: "Name Z to A" },
  { value: "most-fans", label: "Most fans" },
  { value: "most-staked", label: "Most staked" },
];

const isFilter = (value: string | null): value is PoolFilter =>
  FILTERS.some(option => option.value === value);
const isSort = (value: string | null): value is PoolSort =>
  SORTS.some(option => option.value === value);

interface DirectoryQuery {
  q: string;
  filter: PoolFilter;
  sort: PoolSort;
}

function Directory({
  initialData,
  query,
  onChange,
}: {
  initialData?: PoolsPageData | null;
  query: DirectoryQuery;
  onChange: (next: Partial<DirectoryQuery>) => void;
}) {
  const [search, setSearch] = useState(query.q);
  const [count, setCount] = useState<{ shown: number; total: number } | null>(null);

  // Keep the field in step with the URL (back button, Clear search)
  useEffect(() => setSearch(query.q), [query.q]);

  // Search writes ?q= after 300ms so results are shareable and survive reload
  useEffect(() => {
    if (search === query.q) return;
    const timer = setTimeout(() => onChange({ q: search }), 300);
    return () => clearTimeout(timer);
  }, [search, query.q, onChange]);

  const onCount = useCallback((shown: number, total: number) => setCount({ shown, total }), []);
  const sortLabel = SORTS.find(option => option.value === query.sort)?.label ?? "Newest";

  return (
    <>
      <section className="pt-[55px] lg:pt-[68px]">
        <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
          Explore
        </p>
        <h1 className="mt-[13px] font-prism-display text-prism-display-68 text-prism-ink sm:text-prism-display">
          Reward pools
        </h1>
        <p className="mt-[13px] text-prism-body text-prism-ink-2">
          Discover and join pools in the community.
        </p>
      </section>

      <section aria-label="Find pools" className="mt-[34px] space-y-[21px]">
        <div className="flex flex-col gap-[13px] sm:flex-row sm:items-center">
          <div className="relative sm:w-[610px]">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-10 h-[21px] w-[21px] -translate-y-1/2 text-prism-ink-2"
            />
            <Input
              type="search"
              aria-label="Search pools or creators"
              placeholder="Search pools or creators"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-11 [&::-webkit-search-cancel-button]:hidden"
              trailing={
                search ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch("");
                      onChange({ q: "" });
                    }}
                    className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                ) : undefined
              }
            />
          </div>
          <div className="flex items-center justify-between gap-[13px] sm:flex-1">
            <p className="text-prism-meta tabular-nums text-prism-ink-2" aria-live="polite">
              {count &&
                (count.shown < count.total
                  ? `${count.shown} of ${count.total} pools`
                  : `${count.total} ${count.total === 1 ? "pool" : "pools"}`)}
            </p>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary">
                  Sort {sortLabel}
                  <ChevronDown aria-hidden />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                {SORTS.map(option => (
                  <MenuItem key={option.value} onSelect={() => onChange({ sort: option.value })}>
                    <span className="flex-1">{option.label}</span>
                    {option.value === query.sort && <Check aria-hidden />}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
        </div>
        <div className="-mx-[13px] overflow-x-auto px-[13px] pb-1 sm:mx-0 sm:px-0">
          <ChipGroup
            label="Filter pools"
            options={FILTERS}
            value={query.filter}
            onChange={filter => onChange({ filter })}
            className="flex-nowrap sm:flex-wrap"
          />
        </div>
        <Notice variant="warning" title="Testnet only.">
          {TESTNET_NOTICE.replace(/^Testnet only\.\s*/, "")}
        </Notice>
      </section>

      <section aria-label="Pools" className="mt-[34px]">
        <PoolsTab
          searchQuery={query.q}
          poolFilter={query.filter}
          poolSort={query.sort}
          initialData={initialData}
          onCount={onCount}
          onClearSearch={() => onChange({ q: "" })}
          onShowAll={() => onChange({ filter: "all" })}
        />
      </section>
    </>
  );
}

// Search, filter and sort live in the URL (?q=, ?filter=, ?sort=).
function DirectoryWithUrl({ initialData }: { initialData?: PoolsPageData | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = params.get("filter");
  const sort = params.get("sort");
  const query: DirectoryQuery = {
    q: params.get("q") ?? "",
    filter: isFilter(filter) ? filter : "all",
    sort: isSort(sort) ? sort : "newest",
  };

  const onChange = useCallback(
    (next: Partial<DirectoryQuery>) => {
      const updated = new URLSearchParams(params.toString());
      const set = (key: string, value: string | undefined, fallback: string) => {
        if (value === undefined) return;
        if (!value || value === fallback) updated.delete(key);
        else updated.set(key, value);
      };
      set("q", next.q, "");
      set("filter", next.filter, "all");
      set("sort", next.sort, "newest");
      const search = updated.toString();
      router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return <Directory initialData={initialData} query={query} onChange={onChange} />;
}

interface PoolsPageContentProps {
  initialData?: PoolsPageData | null;
}

// Pools directory (Screen Review 070, D20): a Prism public page on the room.
export default function PoolsPageContent({ initialData }: PoolsPageContentProps) {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[1288px] flex-1 px-[13px] pb-[55px] lg:px-0">
        {/* The server render shows the default list; the URL query applies on hydrate */}
        <Suspense
          fallback={
            <Directory
              initialData={initialData}
              query={{ q: "", filter: "all", sort: "newest" }}
              onChange={() => undefined}
            />
          }
        >
          <DirectoryWithUrl initialData={initialData} />
        </Suspense>
      </main>
      <div className="px-[13px] sm:px-[34px]">
        <PublicFooter />
      </div>
    </div>
  );
}
