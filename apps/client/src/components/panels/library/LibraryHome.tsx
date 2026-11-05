/**
 * The Library, one page with no tabs (Build Board #26, FL-3, row 124; boards
 * m1, d1, m12, fl-q1). Order: Continue, Saved, Your creators, Newest. Header:
 * Search, Filter and Inbox. Desktop puts Your creators and Saved in a side
 * column. Downloads (FL-5) sits beside Saved; Memberships (FL-7) joins later.
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import {
  Bookmark,
  ChevronRight,
  Compass,
  MessageCircle,
  Search,
  SlidersHorizontal,
  WifiOff,
} from "lucide-react";
import type { LibraryCreatorRow, LibraryItem } from "@repo/constants";
import {
  Button,
  EmptyState,
  ErrorCard,
  Skeleton,
  cn,
  trpc,
  useAuth,
  useOptionalPlayer,
} from "@repo/ui";
import { DownloadsTile } from "./downloads/DownloadsPage";
import { readIndex, useDownloadsVersion } from "./downloads/store";
import { useDelayed } from "@/hooks/useDelayed";
import { isFeatureOn } from "@/config/featureFlags";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import {
  ActiveFilterChip,
  FilterSheet,
  readFilter,
  writeFilter,
  type LibraryFilter,
} from "./FilterSheet";
import { ItemMenu } from "./ItemMenu";
import {
  DEFAULT_ACCENT,
  ItemCover,
  ItemListSkeleton,
  ItemRow,
  OwnerLine,
  PlayGlyph,
  SectionHeading,
  minutesLeft,
  ownerName,
  playerItemFor,
  progressFraction,
  resolverFor,
} from "./parts";
import { CreatorRow, CreatorsFooter } from "./YourCreators";

const C = LIBRARY_COPY;
const SIDE_CREATORS = 5;
/** FL-5: Downloads needs Cache Storage */
const downloadsOn = typeof caches !== "undefined";

export function LibraryHome() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params);
  const filtered = !!(filter.type || filter.source || filter.where);
  const { authUser } = useAuth();
  useDownloadsVersion();
  // On this device: the ids of this account's downloads (FL-5)
  const deviceIds =
    authUser && filter.where === "device"
      ? readIndex(authUser.id).items.map(item => item.publicId)
      : undefined;
  const [filterOpen, setFilterOpen] = useState(false);

  const continueQuery = useQuery({
    ...trpc.library.continue.queryOptions({}),
    enabled: !filtered,
  });
  const saved = useQuery({ ...trpc.library.saved.queryOptions({}), enabled: !filtered });
  const creators = useQuery({ ...trpc.library.creators.queryOptions({}), enabled: !filtered });
  const newest = useInfiniteQuery(
    trpc.library.newest.infiniteQueryOptions(
      {
        type: filter.type ?? undefined,
        source: filter.source ?? undefined,
        ...(filter.where === "device" ? { where: "device" as const, deviceIds } : {}),
      },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const newestItems = useMemo(() => newest.data?.pages.flatMap(p => p.items) ?? [], [newest.data]);
  const skeleton = useDelayed(newest.isLoading, 400);

  const applyFilter = (next: LibraryFilter) => setParams(writeFilter(params, next));
  const openItem = (item: LibraryItem) =>
    navigate(LIBRARY_PATHS.item(item.owner.handle, item.publicId), {
      state: { savedAt: item.savedAt },
    });

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => navigate(LIBRARY_PATHS.search)}>
        <Search aria-hidden />
        {C.search}
      </Button>
      <Button variant="secondary" onClick={() => setFilterOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden />
        {C.filter}
      </Button>
      {isFeatureOn("messages") && (
        <Button variant="ghost" onClick={() => navigate("/inbox")}>
          <MessageCircle aria-hidden />
          {C.inbox}
        </Button>
      )}
      <ActiveFilterChip
        filter={filter}
        onClear={() => applyFilter({ type: null, source: null, where: null })}
      />
    </div>
  );

  const failed = newest.isError;
  const offline = failed && typeof navigator !== "undefined" && navigator.onLine === false;
  const continueItems = continueQuery.data?.items ?? [];
  const creatorRows = creators.data?.items ?? [];
  const everythingEmpty =
    !filtered &&
    newest.isSuccess &&
    newestItems.length === 0 &&
    continueQuery.isSuccess &&
    continueItems.length === 0 &&
    creators.isSuccess &&
    creatorRows.length === 0;

  let body: React.ReactNode;
  if (failed) {
    body = offline ? (
      <EmptyState
        icon={WifiOff}
        title={C.error.offlineTitle}
        description={C.error.offline}
        action={
          <Button onClick={() => navigate(LIBRARY_PATHS.downloads)}>{C.error.openDownloads}</Button>
        }
      />
    ) : (
      <ErrorCard
        title={C.error.title}
        cause={C.error.cause}
        onRetry={() => void newest.refetch()}
      />
    );
  } else if (everythingEmpty) {
    body = (
      <EmptyState
        icon={Compass}
        title={C.empty.libraryTitle}
        description={C.empty.library}
        action={<Button onClick={() => navigate("/explore")}>{C.empty.explore}</Button>}
      />
    );
  } else {
    body = (
      <div className="grid gap-[34px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-[34px]">
          {!filtered && <ContinueSection items={continueItems} />}
          {/* Phones: Saved and Your creators sit between Continue and Newest */}
          {!filtered && (
            <div className="space-y-[34px] lg:hidden">
              <div className="space-y-2">
                <SavedTile
                  items={saved.data?.items ?? []}
                  more={!!saved.data?.nextCursor}
                  loading={saved.isLoading}
                />
                {downloadsOn && <DownloadsTile account={authUser?.id ?? null} />}
              </div>
              <CreatorsSection rows={creatorRows} loading={creators.isLoading} />
            </div>
          )}
          <section aria-labelledby="library-newest" className="space-y-2">
            <SectionHeading id="library-newest">{C.newestTitle}</SectionHeading>
            {newest.isLoading ? (
              skeleton ? (
                <ItemListSkeleton label={C.newestTitle} />
              ) : null
            ) : newestItems.length === 0 ? (
              filtered ? (
                <EmptyState
                  icon={SlidersHorizontal}
                  title={C.empty.filteredTitle}
                  description={C.empty.filtered}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => applyFilter({ type: null, source: null, where: null })}
                    >
                      {C.filterSheet.clear}
                    </Button>
                  }
                />
              ) : (
                <p className="py-4 text-[15px] text-prism-ink-2">{C.empty.creators}</p>
              )
            ) : (
              <ul className="space-y-1">
                {newestItems.map(item => (
                  <li key={item.publicId}>
                    <ItemRow
                      item={item}
                      onOpen={() => openItem(item)}
                      menu={<ItemMenu item={item} />}
                    />
                  </li>
                ))}
              </ul>
            )}
            {newest.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => void newest.fetchNextPage()}
                  disabled={newest.isFetchingNextPage}
                >
                  {newest.isFetchingNextPage ? C.loadingMore : C.showMore}
                </Button>
              </div>
            )}
          </section>
        </div>
        {!filtered && (
          <aside className="hidden space-y-[34px] lg:block">
            <CreatorsSection rows={creatorRows} loading={creators.isLoading} />
            <div className="space-y-2">
              <SavedTile
                items={saved.data?.items ?? []}
                more={!!saved.data?.nextCursor}
                loading={saved.isLoading}
              />
              {downloadsOn && <DownloadsTile account={authUser?.id ?? null} />}
            </div>
          </aside>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-[21px]">
      {header}
      {body}
      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filter}
        onApply={applyFilter}
      />
    </div>
  );
}

/** Continue: up to 12 unfinished items, last played first (board m1). */
function ContinueSection({ items }: { items: LibraryItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="library-continue" className="space-y-2">
      <SectionHeading id="library-continue">{C.continueTitle}</SectionHeading>
      <ul className="-mx-[13px] flex snap-x gap-[13px] overflow-x-auto px-[13px] pb-2 [scrollbar-width:none]">
        {items.map(item => (
          <li key={item.publicId} className="w-[248px] shrink-0 snap-start">
            <ContinueCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A Continue card (row 124): the cover with progress, a 44 px play button in
 * the creator's button color, minutes left, a 2 line title and the creator with
 * the 4 px brand mark. The card opens the item; play starts it here.
 */
export function ContinueCard({
  item,
  inCreatorSection = false,
}: {
  item: LibraryItem;
  inCreatorSection?: boolean;
}) {
  const navigate = useNavigate();
  const player = useOptionalPlayer();
  const playerItem = playerItemFor(item);
  const left = minutesLeft(item);
  const fraction = progressFraction(item);
  const accent = item.owner.accent || DEFAULT_ACCENT;
  const open = () =>
    navigate(LIBRARY_PATHS.item(item.owner.handle, item.publicId), {
      state: { savedAt: item.savedAt },
    });

  return (
    <div className="rounded-prism-13 bg-white/70 p-2 shadow-prism-e1">
      <div className="relative">
        <button
          type="button"
          onClick={open}
          aria-label={`${C.open(item.title)}, ${C.by(ownerName(item.owner))}`}
          className="prism-focus block w-full rounded-prism-13"
        >
          <ItemCover item={item} sizes="248px" className="aspect-video w-full rounded-prism-13" />
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-prism-13 bg-black/20"
          >
            <span
              className="block h-full"
              style={{ width: `${fraction * 100}%`, background: accent }}
            />
          </span>
        </button>
        {playerItem && player && (
          <button
            type="button"
            aria-label={C.play(item.title)}
            onClick={() =>
              void player.load(playerItem, resolverFor(item.publicId), {
                autoplay: true,
                startAtMs: item.progress?.positionMs ?? null,
              })
            }
            className="prism-focus absolute bottom-3 left-2 flex h-touch w-touch items-center justify-center rounded-full text-white shadow-prism-e2"
            style={{ background: accent }}
          >
            <PlayGlyph />
          </button>
        )}
      </div>
      <div className="flex items-start gap-1 pt-2">
        <button
          type="button"
          onClick={open}
          className="prism-focus min-w-0 flex-1 rounded-prism-13 px-1 text-left"
          tabIndex={-1}
          aria-hidden
        >
          <span className="line-clamp-2 text-[16px] font-semibold leading-snug text-prism-ink">
            {item.title}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[13px] text-prism-ink-2">
            {!inCreatorSection && <OwnerLine owner={item.owner} className="min-w-0" />}
            {left !== null && <span className="shrink-0 tabular-nums">{C.minutesLeft(left)}</span>}
          </span>
        </button>
        <ItemMenu item={item} inContinue inCreatorSection={inCreatorSection} />
      </div>
    </div>
  );
}

/** The Saved tile: the first covers and how many (the Downloads half is FL-5). */
function SavedTile({
  items,
  more,
  loading,
}: {
  items: LibraryItem[];
  more: boolean;
  loading: boolean;
}) {
  const navigate = useNavigate();
  const count = items.length;
  return (
    <section aria-labelledby="library-saved">
      <h2 id="library-saved" className="sr-only">
        {C.savedTitle}
      </h2>
      <button
        type="button"
        onClick={() => navigate(LIBRARY_PATHS.saved)}
        className="prism-focus flex min-h-[72px] w-full items-center gap-3 rounded-prism-13 bg-white/70 px-3 py-2 text-left shadow-prism-e1 transition-colors duration-prism-hover ease-prism hover:bg-white"
      >
        <span className="flex h-touch w-touch shrink-0 items-center justify-center rounded-full bg-prism-nav-tint">
          <Bookmark aria-hidden className="h-5 w-5 text-prism-ink" strokeWidth={1.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-prism-ink">{C.savedTitle}</span>
          <span className="block text-[14px] text-prism-ink-2">
            {loading ? (
              <Skeleton className="mt-1 h-3 w-20 rounded-full" />
            ) : count ? (
              `${C.savedTile(count)}${more ? "+" : ""}`
            ) : (
              C.savedTileEmpty
            )}
          </span>
        </span>
        <span aria-hidden className="flex -space-x-3">
          {items.slice(0, 3).map(item => (
            <ItemCover
              key={item.publicId}
              item={item}
              sizes="40px"
              className="h-10 w-10 rounded-prism-13 ring-2 ring-white"
            />
          ))}
        </span>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-prism-ink-3" />
      </button>
    </section>
  );
}

/** Your creators on the Library page: the first five, then See all (rows 124, 180). */
function CreatorsSection({ rows, loading }: { rows: LibraryCreatorRow[]; loading: boolean }) {
  const navigate = useNavigate();
  if (!loading && !rows.length) return null;
  return (
    <section aria-labelledby="library-creators" className="space-y-1">
      <SectionHeading
        id="library-creators"
        action={
          rows.length > SIDE_CREATORS ? (
            <Button variant="link" onClick={() => navigate(LIBRARY_PATHS.creators)}>
              {C.seeAll}
            </Button>
          ) : null
        }
      >
        {C.creatorsTitle}
      </SectionHeading>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-[64px] w-full rounded-prism-13" />
          ))}
        </div>
      ) : (
        <ul className={cn("space-y-1")}>
          {rows.slice(0, SIDE_CREATORS).map(row => (
            <li key={row.owner.handle}>
              <CreatorRow row={row} />
            </li>
          ))}
        </ul>
      )}
      <CreatorsFooter rows={rows} />
    </section>
  );
}
