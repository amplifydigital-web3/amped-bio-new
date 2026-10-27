import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Users } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  cn,
  trpc,
} from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { Avatar, RowSkeleton, SectionHeader } from "./shared";
import { copyText, fanPageUrl, formatPoolAmount, shortAddress } from "./format";

const PAGE_SIZE = 10;

const SORTS = {
  "most-staked": { label: "Most staked", orderBy: "stakeAmount", orderDirection: "desc" },
  "least-staked": { label: "Least staked", orderBy: "stakeAmount", orderDirection: "asc" },
  newest: { label: "Newest", orderBy: "createdAt", orderDirection: "desc" },
  oldest: { label: "Oldest", orderBy: "createdAt", orderDirection: "asc" },
} as const;
type SortKey = keyof typeof SORTS;

function pageNumbers(page: number, total: number) {
  const start = Math.max(1, Math.min(page - 2, total - 4));
  return Array.from({ length: Math.min(5, total) }, (_, index) => start + index);
}

/**
 * Screen Review 068: Top fans as a ranked G0 list with one Sort menu, its own
 * loading, empty and error states, and real staked and rewards figures
 * (Rob, 30 Sep). Rows link to the fan's page; fans without a handle show a
 * short address with Copy.
 */
export function TopFans({
  chainId,
  symbol,
  poolLink,
}: {
  chainId: string;
  symbol: string;
  poolLink: string;
}) {
  const [params, setParams] = useSearchParams();
  const sortParam = params.get("fans") as SortKey | null;
  const sortKey: SortKey = sortParam && sortParam in SORTS ? sortParam : "most-staked";
  const sort = SORTS[sortKey];
  const page = Math.max(1, Number(params.get("fansPage")) || 1);

  const setQuery = (next: { fans?: SortKey; fansPage?: number }) =>
    setParams(
      current => {
        const copy = new URLSearchParams(current);
        if (next.fans) copy.set("fans", next.fans);
        if (next.fansPage && next.fansPage > 1) copy.set("fansPage", String(next.fansPage));
        else copy.delete("fansPage");
        return copy;
      },
      { replace: true }
    );

  const query = useQuery({
    ...trpc.pools.creator.getFans.queryOptions({
      chainId,
      pagination: { page, pageSize: PAGE_SIZE },
      order: { orderBy: sort.orderBy, orderDirection: sort.orderDirection },
    }),
    retry: 1,
  });
  const showSkeleton = useDelayed(query.isLoading, 400);
  const total = query.data?.totalFans ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fans = query.data?.fans ?? [];
  const ranked = sort.orderBy === "stakeAmount";
  const List = ranked ? "ol" : "ul";

  return (
    <section aria-labelledby="top-fans-title" className="min-w-0 space-y-1 font-prism">
      <SectionHeader
        id="top-fans-title"
        title="Top fans"
        meta={query.data ? `${total} ${total === 1 ? "fan" : "fans"}` : undefined}
      >
        {fans.length > 0 && (
          <Menu>
            <MenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                aria-label={`Sort fans, sorted by ${sort.label}`}
              >
                <span className="font-normal max-sm:hidden">Sort</span>
                {sort.label}
                <ChevronDown aria-hidden />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              {(Object.keys(SORTS) as SortKey[]).map(key => (
                <MenuItem
                  key={key}
                  onSelect={() => setQuery({ fans: key, fansPage: 1 })}
                  className="justify-between"
                >
                  {SORTS[key].label}
                  {key === sortKey && <Check aria-hidden className="!text-prism-nav" />}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </SectionHeader>

      {query.isError ? (
        <ErrorCard
          title="Fans did not load"
          cause="The fan list did not respond. Your pool is unchanged."
          onRetry={() => void query.refetch()}
          retryLabel="Retry"
          className="mt-3 !rounded-prism-21"
        />
      ) : query.isLoading ? (
        showSkeleton ? (
          <RowSkeleton rows={PAGE_SIZE} />
        ) : null
      ) : fans.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No fans yet"
          description="Fans who stake in your pool show here. Your own stake counts in Total staked."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyText(poolLink, "Link copied")}
            >
              <Copy aria-hidden />
              Copy pool link
            </Button>
          }
        />
      ) : (
        <>
          <List className="divide-y divide-prism-line">
            {fans.map((fan, index) => {
              const rank = (page - 1) * PAGE_SIZE + index + 1;
              const name = fan.handle ? `@${fan.handle}` : shortAddress(fan.address);
              const staked = formatPoolAmount(fan.stakeAmount);
              const since = `Fan since ${formatDistanceToNow(new Date(fan.createdAt), { addSuffix: true })}`;
              const body = (
                <>
                  {ranked && (
                    <span className="w-[34px] shrink-0 text-right text-prism-meta font-semibold tabular-nums text-prism-ink-2">
                      {rank}
                    </span>
                  )}
                  <Avatar src={fan.avatar} handle={fan.handle} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-prism-label font-semibold tabular-nums text-prism-ink">
                        {name}
                      </span>
                    </span>
                    <span className="block truncate text-prism-meta text-prism-ink-2">{since}</span>
                  </span>
                  <span className="grid shrink-0 grid-cols-2 gap-x-4 text-right max-sm:hidden">
                    <span className="text-prism-label font-semibold tabular-nums text-prism-ink">
                      {staked}
                    </span>
                    <span className="text-prism-label font-semibold tabular-nums text-prism-ink">
                      {fan.rewards === null ? "Updating" : formatPoolAmount(fan.rewards)}
                    </span>
                    <span className="text-prism-meta text-prism-ink-2">{symbol} staked</span>
                    <span className="text-prism-meta text-prism-ink-2">{symbol} rewards</span>
                  </span>
                </>
              );
              const mobileFigures = (
                <span className="flex gap-4 pl-[46px] text-prism-meta text-prism-ink-2 sm:hidden">
                  <span>
                    <b className="text-prism-label font-semibold tabular-nums text-prism-ink">
                      {staked}
                    </b>{" "}
                    {symbol} staked
                  </span>
                  <span>
                    <b className="text-prism-label font-semibold tabular-nums text-prism-ink">
                      {fan.rewards === null ? "Updating" : formatPoolAmount(fan.rewards)}
                    </b>{" "}
                    {symbol} rewards
                  </span>
                </span>
              );
              return (
                <li key={fan.id}>
                  {fan.handle ? (
                    <a
                      href={fanPageUrl(fan.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${name}, staked ${staked} ${symbol}, opens in a new tab`}
                      className="prism-focus prism-dock-item flex min-h-[55px] flex-col justify-center gap-1 rounded-prism-8 py-2"
                    >
                      <span className="flex items-center gap-3">{body}</span>
                      {mobileFigures}
                    </a>
                  ) : (
                    <div className="flex min-h-[55px] flex-col justify-center gap-1 py-2">
                      <span className="flex items-center gap-3">
                        {body}
                        <button
                          type="button"
                          aria-label="Copy address"
                          onClick={() => void copyText(fan.address, "Address copied")}
                          className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
                        >
                          <Copy aria-hidden className="h-4 w-4" />
                        </button>
                      </span>
                      {mobileFigures}
                    </div>
                  )}
                </li>
              );
            })}
          </List>

          {totalPages > 1 && (
            <nav
              aria-label="Fans pages"
              className="flex min-h-[55px] items-center justify-between gap-3 border-t border-prism-line pt-2"
            >
              <span className="text-prism-meta tabular-nums text-prism-ink-2 max-sm:hidden">
                {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} fans
              </span>
              <div className="flex items-center gap-1 max-sm:w-full max-sm:justify-between">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setQuery({ fansPage: page - 1 })}
                  className="prism-icon-btn prism-focus prism-btn-disabled"
                >
                  <ChevronLeft aria-hidden className="h-5 w-5" />
                </button>
                <span className="text-prism-meta tabular-nums text-prism-ink-2 sm:hidden">
                  Page {page} of {totalPages}
                </span>
                {pageNumbers(page, totalPages).map(number => (
                  <button
                    key={number}
                    type="button"
                    aria-current={number === page ? "page" : undefined}
                    aria-label={`Page ${number}`}
                    onClick={() => setQuery({ fansPage: number })}
                    className={cn(
                      "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-label tabular-nums max-sm:hidden",
                      number === page ? "prism-lens-thumb" : "text-prism-ink"
                    )}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setQuery({ fansPage: page + 1 })}
                  className="prism-icon-btn prism-focus prism-btn-disabled"
                >
                  <ChevronRight aria-hidden className="h-5 w-5" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
