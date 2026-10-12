import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  MoreHorizontal,
  Search,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  BottomSheet,
  BottomSheetContent,
  Button,
  Checkbox,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Skeleton,
  trpc,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@repo/ui";
import { toast } from "@/components/ui/toast";

type Range = "7d" | "30d" | "90d";
type Filter = "all" | "new" | "poolFans" | "public";
type Follower = RouterOutputs["follow"]["listFollowers"]["items"][number];

const RANGE_LABELS: Record<Range, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "poolFans", label: "Pool fans" },
  { value: "public", label: "Shown publicly" },
];
const SOURCE_LABELS: Record<string, string> = {
  page: "Your page",
  explore: "Explore",
  pool: "Pool page",
  broadcast: "Broadcast",
  qr: "QR code",
};

const numberFormat = new Intl.NumberFormat("en-US");
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function followedText(value: Date | string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `Today, ${timeFormat.format(date)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFormat.format(date);
}

function sourceText(row: Follower) {
  return row.campaignName ?? SOURCE_LABELS[row.source] ?? row.source;
}

function download(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function useDelayed(active: boolean, ms = 400) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) return setShown(false);
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

// 13x3 marker eyebrows (section 10): indigo for People, cyan for Settings
const EYEBROW =
  "flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2 before:h-[3px] before:w-[13px] before:rounded-full before:bg-prism-create-light before:content-['']";
const EYEBROW_NAV =
  "flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2 before:h-[3px] before:w-[13px] before:rounded-full before:bg-prism-nav before:content-['']";

const POOL_FAN_BADGE = "!bg-[#F1EAF6] !text-prism-value-ink !shadow-none";

function FollowerAvatar({
  row,
}: {
  row: { image: string | null; name: string; handle: string | null };
}) {
  if (row.image)
    return (
      <img src={row.image} alt="" className="h-touch w-touch shrink-0 rounded-full object-cover" />
    );
  return (
    <span
      aria-hidden
      className="flex h-touch w-touch shrink-0 items-center justify-center rounded-full bg-prism-nav-tint text-prism-label font-bold text-prism-nav-pressed"
    >
      {(row.name || row.handle || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="prism-glass-clear flex min-w-0 flex-col !rounded-prism-21 p-[13px] font-prism md:p-[21px]">
      <span className="text-prism-label font-semibold text-prism-ink-2">{label}</span>
      <div className="mt-[8px] text-prism-card-title tabular-nums text-prism-ink">{value}</div>
      {note && <span className="mt-1 text-prism-meta text-prism-ink-2">{note}</span>}
    </div>
  );
}

/**
 * Fan Graph (#22): the People destination, Followers (boards fg5, fg7, fg10,
 * fg11). Names, handles, dates and sources only. Never email or wallet.
 */
export function PeoplePanel() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>("30d");
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const q = useDebounce(text, 300).trim();
  // The cursor belongs to one search and filter. When either changes, the
  // cursor is 0 in the same render, so no stale page is fetched or appended
  // (QA-016).
  const listKey = `${filter}|${q}`;
  const [paging, setPaging] = useState({ key: listKey, cursor: 0 });
  const cursor = paging.key === listKey ? paging.cursor : 0;
  const setCursor = (next: number) => setPaging({ key: listKey, cursor: next });
  const [rows, setRows] = useState<Follower[]>([]);
  // Followers removed in this visit, until Undo brings them back
  const removedIds = useRef(new Set<Follower["userId"]>());
  const [blockTarget, setBlockTarget] = useState<Follower | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const stats = useQuery({
    ...trpc.follow.stats.queryOptions({ range }),
    placeholderData: keepPreviousData,
  });
  const list = useQuery({
    ...trpc.follow.listFollowers.queryOptions({
      q: q || undefined,
      filter,
      sort: "newest",
      cursor,
    }),
    placeholderData: keepPreviousData,
  });
  const blocked = useQuery(trpc.follow.listBlocked.queryOptions());

  useEffect(() => {
    if (!list.data || list.isPlaceholderData) return;
    // A refetched page can repeat people already shown, or still hold someone
    // just removed while the server catches up. Neither is added (QA-017).
    const page = list.data.items.filter(item => !removedIds.current.has(item.userId));
    setRows(previous => {
      if (cursor === 0) return page;
      const seen = new Set(previous.map(item => item.userId));
      return [...previous, ...page.filter(item => !seen.has(item.userId))];
    });
  }, [list.data, list.isPlaceholderData, cursor]);

  const invalidate = async () => {
    setCursor(0);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.follow.listFollowers.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.follow.stats.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.follow.listBlocked.queryKey() }),
    ]);
  };

  const remove = useMutation(trpc.follow.removeFollower.mutationOptions());
  const restore = useMutation(trpc.follow.restoreFollower.mutationOptions());
  const block = useMutation(trpc.follow.blockFollower.mutationOptions());
  const unblock = useMutation(trpc.follow.unblock.mutationOptions());
  const setCountVisibility = useMutation(trpc.follow.setCountVisibility.mutationOptions());

  const onRemove = async (row: Follower) => {
    try {
      const { restoreToken } = await remove.mutateAsync({ userId: row.userId });
      removedIds.current.add(row.userId);
      setRows(previous => previous.filter(item => item.userId !== row.userId));
      toast.add({
        type: "success",
        title: `Removed ${row.name}.`,
        duration: 8000,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void restore
              .mutateAsync({ token: restoreToken })
              .then(() => {
                removedIds.current.delete(row.userId);
                return invalidate();
              })
              .catch(() => toast.add({ type: "error", title: "Undo is no longer available." }));
          },
        },
      });
      // The refetch starts again from the first page, so no page is appended twice
      setCursor(0);
      void queryClient.invalidateQueries({ queryKey: trpc.follow.stats.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.follow.listFollowers.queryKey() });
    } catch {
      toast.add({ type: "error", title: "That didn't work. Try again." });
    }
  };

  const onBlock = async () => {
    if (!blockTarget) return;
    try {
      await block.mutateAsync({ userId: blockTarget.userId });
      toast.add({ type: "success", title: `Blocked ${blockTarget.name}.` });
      setBlockTarget(null);
      await invalidate();
    } catch {
      toast.add({ type: "error", title: "That didn't work. Try again." });
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const { csv } = await trpcClient.follow.exportFollowers.mutate({ filter });
      download(csv, `followers-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      toast.add({ type: "error", title: (error as Error).message || "Export failed. Try again." });
    } finally {
      setExporting(false);
    }
  };

  const copyLink = async () => {
    const url = `${import.meta.env.VITE_LANDINGPAGE_URL}/${authUser?.handle ?? ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.add({ type: "success", title: "Page link copied." });
    } catch {
      toast.add({ type: "error", title: "Could not copy the link." });
    }
  };

  const showStatsSkeleton = useDelayed(stats.isLoading);
  const showListSkeleton = useDelayed(list.isLoading);
  const data = stats.data;
  const neverHadFollowers = data !== undefined && data.total === 0 && !q && filter === "all";
  const maxSource = useMemo(() => Math.max(1, ...(data?.sources.map(s => s.count) ?? [1])), [data]);
  const sourceTotal = useMemo(
    () => (data?.sources ?? []).reduce((sum, s) => sum + s.count, 0),
    [data]
  );

  const settings = (
    <section
      aria-label="Follower settings"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]"
    >
      <span className={EYEBROW}>Settings</span>
      <Checkbox
        checked={data?.showFollowerCount ?? true}
        onCheckedChange={checked => {
          void setCountVisibility
            .mutateAsync({ show: checked })
            .then(() => queryClient.invalidateQueries({ queryKey: trpc.follow.stats.queryKey() }))
            .catch(() =>
              toast.add({ type: "error", title: "Your change was not saved. Try again." })
            );
        }}
      >
        Show my follower count
        <span className="mt-1 block text-prism-meta text-prism-ink-2">
          Under 10 shows as New on Amped.
        </span>
      </Checkbox>
      {(blocked.data?.length ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-prism-body text-prism-ink">Blocked accounts</span>
          <Button variant="ghost" onClick={() => setBlockedOpen(true)}>
            Manage, {blocked.data?.length}
          </Button>
        </div>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        You never see a follower&apos;s email or wallet address.
      </p>
    </section>
  );

  return (
    <div className="space-y-[21px] px-[21px] pb-[55px] pt-[21px] font-prism">
      <div className="flex flex-wrap items-center justify-between gap-[13px]">
        <h2 className={EYEBROW_NAV}>Followers</h2>
        {!neverHadFollowers && (
          <div className="flex items-center gap-2">
            <Menu>
              <MenuTrigger
                aria-label={`Period: ${RANGE_LABELS[range]}`}
                className="prism-well prism-focus flex h-touch items-center justify-between gap-2 px-[13px] text-prism-label text-prism-ink md:w-[233px]"
              >
                <span className="truncate">{RANGE_LABELS[range]}</span>
                <ChevronDown aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
              </MenuTrigger>
              <MenuContent align="end" className="min-w-[233px]">
                {(Object.keys(RANGE_LABELS) as Range[]).map(value => (
                  <MenuItem
                    key={value}
                    role="menuitemradio"
                    aria-checked={value === range}
                    onSelect={() => setRange(value)}
                  >
                    {RANGE_LABELS[value]}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <Button
              variant="secondary"
              onClick={() => void onExport()}
              disabled={exporting}
              aria-busy={exporting || undefined}
            >
              {exporting ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              <span className="max-sm:sr-only">{exporting ? "Exporting" : "Export CSV"}</span>
            </Button>
          </div>
        )}
      </div>

      {stats.isError ? (
        <ErrorCard
          title="Your followers did not load"
          cause="Check your connection."
          onRetry={() => void stats.refetch()}
        />
      ) : stats.isLoading ? (
        showStatsSkeleton ? (
          <div
            className="grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]"
            aria-busy
            aria-label="Loading"
          >
            {[0, 1, 2, 3].map(index => (
              <Skeleton
                key={index}
                className="h-[110px] rounded-prism-21 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : null
      ) : neverHadFollowers ? (
        <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_386px]">
          <div className="prism-glass-clear flex min-h-[377px] items-center justify-center !rounded-prism-21">
            <EmptyState
              icon={UsersRound}
              title="No followers yet"
              description="Visitors follow you with one tap on your page. Share your link to get your first followers."
              action={
                <Button size="lg" onClick={() => void copyLink()}>
                  <Copy aria-hidden />
                  Copy page link
                </Button>
              }
            />
          </div>
          {settings}
        </div>
      ) : (
        <>
          <section
            aria-label="Totals"
            className="grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]"
          >
            <Tile
              label="Followers"
              value={numberFormat.format(data?.total ?? 0)}
              note="Confirmed accounts only"
            />
            <Tile
              label={`New in ${range.replace("d", " days")}`}
              value={`+${numberFormat.format(data?.newInRange ?? 0)}`}
              note={`${numberFormat.format(data?.unfollowsInRange ?? 0)} unfollowed`}
            />
            <Tile
              label="Follow rate"
              value={
                data?.followRate === null || data?.followRate === undefined
                  ? "None yet"
                  : `${data.followRate}%`
              }
              note="Follows from your page per page view"
            />
            <Tile
              label="Also pool fans"
              value={numberFormat.format(data?.poolFans ?? 0)}
              note={`${data?.poolFanShare ?? 0}% follow you and stake in your pool`}
            />
          </section>

          <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_386px]">
            <section
              aria-label="Followers"
              className="prism-glass-clear min-w-0 !rounded-prism-21 p-[13px]"
            >
              <div className="flex flex-col gap-[13px] pb-2 xl:flex-row xl:items-center">
                <div className="prism-well flex h-touch min-w-0 flex-1 items-center gap-2 !rounded-prism-13 pl-3">
                  <Search className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" aria-hidden />
                  <label htmlFor="followers-search" className="sr-only">
                    Search followers
                  </label>
                  <input
                    id="followers-search"
                    type="search"
                    value={text}
                    placeholder="Search by name or @handle"
                    onChange={event => setText(event.target.value)}
                    className="h-full min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink placeholder:text-prism-ink-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                  />
                  {text && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setText("")}
                      className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2"
                    >
                      <X className="h-[21px] w-[21px]" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="-mx-[13px] overflow-x-auto px-[13px]">
                  <ChipGroup<Filter>
                    label="Filter followers"
                    value={filter}
                    onChange={setFilter}
                    options={FILTERS}
                    className="flex-nowrap"
                  />
                </div>
              </div>

              {list.isError ? (
                <ErrorCard
                  title="Your followers did not load"
                  cause="Check your connection."
                  onRetry={() => void list.refetch()}
                />
              ) : list.isLoading ? (
                showListSkeleton ? (
                  <div className="space-y-2" aria-busy aria-label="Loading">
                    {[0, 1, 2, 3].map(index => (
                      <Skeleton
                        key={index}
                        className="h-[61px] rounded-prism-13 motion-reduce:animate-none"
                      />
                    ))}
                  </div>
                ) : null
              ) : rows.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={q ? `No followers match '${q}'` : "No followers match this filter"}
                  action={
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setText("");
                        setFilter("all");
                      }}
                    >
                      {q ? "Clear search" : "Clear filter"}
                    </Button>
                  }
                />
              ) : (
                <div role="table" aria-label="Followers" className="w-full">
                  <div
                    role="row"
                    className="grid h-[34px] grid-cols-[44px_minmax(0,1fr)_150px_150px_44px] items-center gap-[13px] px-2 text-prism-meta font-semibold text-prism-ink-2 max-md:hidden"
                  >
                    <span role="columnheader" aria-hidden />
                    <span role="columnheader">Follower</span>
                    <span role="columnheader">Followed</span>
                    <span role="columnheader">Came from</span>
                    <span role="columnheader" className="sr-only">
                      Actions
                    </span>
                  </div>
                  {rows.map(row => (
                    <div
                      role="row"
                      key={row.userId}
                      className="grid min-h-[61px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-[13px] border-t border-prism-line px-2 py-2 md:grid-cols-[44px_minmax(0,1fr)_150px_150px_44px]"
                    >
                      <span role="cell">
                        <FollowerAvatar row={row} />
                      </span>
                      <div role="cell" className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="max-w-full truncate text-prism-label font-semibold text-prism-ink">
                            {row.name}
                          </span>
                          {row.poolFan && (
                            <Badge variant="secondary" className={POOL_FAN_BADGE}>
                              Pool fan
                            </Badge>
                          )}
                          {row.showPublicly && <Badge variant="outline">Public</Badge>}
                        </div>
                        <div className="truncate text-prism-meta text-prism-ink-2">
                          @{row.handle}
                          <span className="md:hidden">. {followedText(row.followedAt)}</span>
                        </div>
                      </div>
                      <span
                        role="cell"
                        className="text-prism-body tabular-nums text-prism-ink max-md:hidden"
                      >
                        {followedText(row.followedAt)}
                      </span>
                      <span
                        role="cell"
                        className="truncate text-prism-body text-prism-ink max-md:hidden"
                      >
                        {sourceText(row)}
                      </span>
                      <span role="cell" className="text-right">
                        <Menu>
                          <MenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`More for ${row.name}`}
                              className="prism-icon-btn prism-focus"
                            >
                              <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden />
                            </button>
                          </MenuTrigger>
                          <MenuContent align="end">
                            <MenuItem onSelect={() => void onRemove(row)}>
                              <UserMinus aria-hidden />
                              Remove follower
                            </MenuItem>
                            <MenuItem onSelect={() => setBlockTarget(row)}>
                              <Ban aria-hidden />
                              Block
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {list.data?.nextCursor != null && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    disabled={list.isFetching}
                    onClick={() => setCursor(list.data!.nextCursor!)}
                  >
                    Show more
                  </Button>
                </div>
              )}
            </section>

            <aside className="flex flex-col gap-[21px]">
              {(data?.sources.length ?? 0) > 0 && (
                <section
                  aria-label="Where follows come from"
                  className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-[21px]"
                >
                  <span className={EYEBROW_NAV}>Where follows come from</span>
                  {data!.sources.slice(0, 6).map(source => {
                    const share = Math.round((source.count / Math.max(1, sourceTotal)) * 100);
                    const label =
                      source.kind === "campaign"
                        ? `${source.label} (campaign)`
                        : (SOURCE_LABELS[source.label] ?? source.label);
                    return (
                      <div key={`${source.kind}:${source.label}`}>
                        <div className="flex justify-between gap-3 text-prism-body text-prism-ink">
                          <span className="truncate">{label}</span>
                          <span className="font-semibold tabular-nums">{share}%</span>
                        </div>
                        <div
                          className="mt-[5px] h-2 overflow-hidden rounded-full bg-prism-line"
                          aria-hidden
                        >
                          <i
                            className="block h-full rounded-full bg-prism-nav"
                            style={{ width: `${(source.count / maxSource) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
              {settings}
            </aside>
          </div>
        </>
      )}

      <Dialog open={!!blockTarget} onOpenChange={open => !open && setBlockTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block {blockTarget?.name}?</DialogTitle>
            <DialogDescription>
              They leave your followers and can&apos;t follow you again. They are not told. You can
              unblock them in Settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBlockTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void onBlock()} disabled={block.isPending}>
              <Ban aria-hidden />
              Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomSheet open={blockedOpen} onOpenChange={setBlockedOpen}>
        <BottomSheetContent title="Blocked accounts">
          <ul className="pb-2">
            {(blocked.data ?? []).map(row => (
              <li
                key={row.userId}
                className="flex min-h-[55px] items-center justify-between gap-3 border-b border-prism-line last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-prism-label font-semibold text-prism-ink">
                    {row.name}
                  </span>
                  <span className="block truncate text-prism-meta text-prism-ink-2">
                    @{row.handle}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void unblock
                      .mutateAsync({ userId: row.userId })
                      .then(invalidate)
                      .catch(() =>
                        toast.add({ type: "error", title: "That didn't work. Try again." })
                      )
                  }
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}

export default PeoplePanel;
