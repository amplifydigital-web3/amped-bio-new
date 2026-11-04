/**
 * The creator section at /library/@handle (Build Board #26, FL-4, row 181;
 * boards m4, d4, fl-q2, fl-q9). In the creator's look inside the Prism frame:
 * header, one status line that opens the status sheet, Continue for this
 * creator, Yours and Shop, and the ownership line. A fan with no connection
 * goes to the creator's public page (spec 3.2). Shop fills in FL-6, the
 * membership and purchase parts of the status sheet in FL-7.
 */
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { ChevronRight, ExternalLink, FileX, Search } from "lucide-react";
import type { LibraryCreatorHeader, LibraryItem, LibraryShopItem } from "@repo/constants";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  CreatorSectionScope,
  EmptyState,
  ErrorCard,
  Skeleton,
  Switch,
  cn,
  creatorSectionColors,
  queryClient,
  trpc,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { trackGAEvent } from "@/utils/ga";
import { useDelayed } from "@/hooks/useDelayed";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { ItemMenu, refreshLibrary } from "./ItemMenu";
import { ContinueCard } from "./LibraryHome";
import { CreatorAvatar, ItemListSkeleton, ItemRow, ownerName } from "./parts";
import { connectionLine } from "./YourCreators";

const C = LIBRARY_COPY;
const SECTION = C.section;
type Segment = "yours" | "shop";

export function publicPageUrl(handle: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/@${handle}`;
}

export function CreatorSection({ handle }: { handle: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const seg: Segment = params.get("seg") === "shop" ? "shop" : "yours";
  const [sheetOpen, setSheetOpen] = useState(false);

  const header = useQuery({ ...trpc.library.creator.queryOptions({ handle }), retry: false });
  const data = header.data;
  const colors = useMemo(() => creatorSectionColors(data?.theme ?? null), [data?.theme]);

  // spec 3.2: a failing pair falls back to Graphite and is logged, ids only
  useEffect(() => {
    if (data && colors.fallbacks.length) {
      trackGAEvent("library_theme_fallback", "library", colors.fallbacks.join(","));
    }
  }, [data, colors.fallbacks]);

  // No connection: the public page is where this creator lives for this fan
  useEffect(() => {
    if (data && !data.connected) window.location.assign(publicPageUrl(handle));
  }, [data, handle]);

  const setSeg = (next: Segment) => {
    const p = new URLSearchParams(params);
    p.set("seg", next);
    setParams(p, { replace: true });
  };

  if (header.isLoading) {
    return (
      <div aria-busy aria-label={C.loadingMore} className="space-y-3">
        <Skeleton className="h-[160px] w-full rounded-prism-21" />
        <ItemListSkeleton label={SECTION.yours} />
      </div>
    );
  }
  if (header.isError) {
    const notFound = (header.error as { data?: { code?: string } })?.data?.code === "NOT_FOUND";
    return notFound ? (
      <EmptyState
        icon={FileX}
        title={SECTION.notFoundTitle}
        description={SECTION.notFound}
        action={<Button onClick={() => navigate(LIBRARY_PATHS.home)}>{C.back}</Button>}
      />
    ) : (
      <ErrorCard
        title={C.error.title}
        cause={C.error.cause}
        onRetry={() => void header.refetch()}
      />
    );
  }
  if (!data || !data.connected) return null;

  const name = ownerName(data.owner);
  return (
    <>
      <CreatorSectionScope
        colors={colors}
        className="overflow-hidden rounded-prism-21 px-[13px] pb-[21px] pt-[21px] md:px-[34px] md:pt-[34px]"
      >
        <SectionHeader header={data} onOpenStatus={() => setSheetOpen(true)} />
        <div className="mt-[21px] space-y-[34px]">
          <CreatorContinue handle={handle} />
          <section aria-label={SECTION.segments} className="space-y-[13px]">
            <div
              role="tablist"
              aria-label={SECTION.segments}
              className="inline-flex rounded-full p-1"
              style={{ background: "var(--c-line)" }}
            >
              {(["yours", "shop"] as const).map(id => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`library-seg-${id}`}
                  aria-selected={seg === id}
                  aria-controls={`library-seg-panel-${id}`}
                  onClick={() => setSeg(id)}
                  className="prism-focus inline-flex h-touch items-center gap-2 rounded-full px-5 text-[15px] font-semibold"
                  style={
                    seg === id
                      ? { background: "var(--c-surface)", color: "var(--c-surface-ink)" }
                      : { color: "var(--c-ink)" }
                  }
                >
                  {SECTION[id]}
                  <span className="tabular-nums opacity-80">{data.counts[id]}</span>
                </button>
              ))}
            </div>
            <div
              role="tabpanel"
              id={`library-seg-panel-${seg}`}
              aria-labelledby={`library-seg-${seg}`}
            >
              {seg === "yours" ? <YoursList handle={handle} name={name} /> : <ShopList />}
            </div>
          </section>
          <p
            className="border-t pt-[13px] text-[14px]"
            style={{ borderColor: "var(--c-line)", color: "var(--c-muted)" }}
          >
            {SECTION.ownership(name)}
          </p>
        </div>
      </CreatorSectionScope>
      <StatusSheet header={data} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}

/** Avatar, name in the creator's name font, the status line, Search and Visit page. */
function SectionHeader({
  header,
  onOpenStatus,
}: {
  header: LibraryCreatorHeader;
  onOpenStatus: () => void;
}) {
  const navigate = useNavigate();
  const name = ownerName(header.owner);
  const status = connectionLine(header);
  return (
    <header className="space-y-[13px]">
      <div className="flex items-center gap-[13px]">
        <CreatorAvatar owner={header.owner} size={72} />
        <div className="min-w-0">
          <h2
            className="truncate text-[28px] font-semibold leading-tight md:text-[32px]"
            style={{ fontFamily: "var(--c-font-name)", color: "var(--c-ink)" }}
          >
            {name}
          </h2>
          <p className="truncate text-[15px]" style={{ color: "var(--c-muted)" }}>
            @{header.owner.handle}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenStatus}
        aria-haspopup="dialog"
        aria-label={`${C.section.statusLabel}: ${status}`}
        className="prism-focus flex min-h-touch w-full items-center gap-2 rounded-prism-13 px-3 text-left text-[15px] font-semibold md:w-auto"
        style={{ background: "var(--c-surface)", color: "var(--c-surface-ink)" }}
      >
        <span className="min-w-0 flex-1 truncate">{status}</span>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0" />
      </button>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            navigate(
              `${LIBRARY_PATHS.search}?handle=${encodeURIComponent(header.owner.handle)}&scope=creator`
            )
          }
          className="prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 border px-4 text-[15px] font-semibold"
          style={{ borderColor: "var(--c-btn)", color: "var(--c-ink)" }}
        >
          <Search aria-hidden className="h-5 w-5" />
          {SECTION.searchCreator(name)}
        </button>
        <a
          href={publicPageUrl(header.owner.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus inline-flex h-touch items-center gap-2 rounded-prism-13 border px-4 text-[15px] font-semibold"
          style={{ borderColor: "var(--c-btn)", color: "var(--c-ink)" }}
        >
          {SECTION.visitPage}
          <ExternalLink aria-hidden className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

function CreatorContinue({ handle }: { handle: string }) {
  const query = useQuery(trpc.library.continue.queryOptions({ handle }));
  const items = query.data?.items ?? [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="library-section-continue" className="space-y-2">
      <h3
        id="library-section-continue"
        className="text-[20px] font-semibold"
        style={{ fontFamily: "var(--c-font-name)", color: "var(--c-ink)" }}
      >
        {SECTION.continueTitle}
      </h3>
      <ul className="-mx-[13px] flex snap-x gap-[13px] overflow-x-auto px-[13px] pb-2 [scrollbar-width:none]">
        {items.map(item => (
          <li key={item.publicId} className="w-[248px] shrink-0 snap-start">
            <ContinueCard item={item} inCreatorSection />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Yours: everything the fan can open from this creator, newest first. */
function YoursList({ handle, name }: { handle: string; name: string }) {
  const navigate = useNavigate();
  const list = useInfiniteQuery(
    trpc.library.creatorItems.infiniteQueryOptions(
      { handle, seg: "yours" },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const items = useMemo(
    () =>
      (list.data?.pages.flatMap(p => p.items as Array<LibraryItem | LibraryShopItem>) ?? []).filter(
        (item): item is LibraryItem => "accessSource" in item
      ),
    [list.data]
  );
  const skeleton = useDelayed(list.isLoading, 400);

  if (list.isLoading) return skeleton ? <ItemListSkeleton label={SECTION.yours} /> : null;
  if (list.isError) {
    return (
      <ErrorCard title={C.error.title} cause={C.error.cause} onRetry={() => void list.refetch()} />
    );
  }
  if (!items.length) {
    return <SectionEmpty title={SECTION.yoursEmptyTitle} description={SECTION.yoursEmpty(name)} />;
  }
  return (
    <>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.publicId}>
            <ItemRow
              item={item}
              themed
              onOpen={() =>
                navigate(LIBRARY_PATHS.item(item.owner.handle, item.publicId), {
                  state: { savedAt: item.savedAt },
                })
              }
              menu={<ItemMenu item={item} inCreatorSection />}
            />
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <div className="flex justify-center pt-[13px]">
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className="prism-focus inline-flex h-touch items-center rounded-prism-13 border px-5 text-[15px] font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--c-btn)", color: "var(--c-ink)" }}
          >
            {list.isFetchingNextPage ? C.loadingMore : C.showMore}
          </button>
        </div>
      )}
    </>
  );
}

/** Shop lists what the fan can join or buy for. The API fills it in FL-6. */
function ShopList() {
  return <SectionEmpty title={SECTION.shopEmptyTitle} description={SECTION.shopEmpty} />;
}

function SectionEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div
      className="rounded-prism-13 px-[21px] py-[34px] text-center"
      style={{ background: "var(--c-surface)", color: "var(--c-surface-ink)" }}
    >
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="mt-1 text-[15px]" style={{ color: "var(--c-surface-muted)" }}>
        {description}
      </p>
    </div>
  );
}

/**
 * The status sheet (fl-q2): Prism, not themed. Opens with "{Creator} and you"
 * and the ownership line. Following: show me publicly, email updates (the one
 * email consent per creator), Unfollow with Undo. New content alerts join in
 * FL-6, Membership and Purchases with receipts in FL-7.
 */
function StatusSheet({
  header,
  open,
  onOpenChange,
}: {
  header: LibraryCreatorHeader;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const S = C.statusSheet;
  const navigate = useNavigate();
  const name = ownerName(header.owner);
  const handle = header.owner.handle;
  const follow = header.status.follow;
  const update = useMutation(trpc.follow.update.mutationOptions());
  const unfollow = useMutation(trpc.follow.unfollow.mutationOptions());
  const undoUnfollow = useMutation(trpc.follow.undoUnfollow.mutationOptions());
  const headerKey = trpc.library.creator.queryKey({ handle });

  const setFollow = async (patch: { showPublicly?: boolean; emailUpdates?: boolean }) => {
    const before = queryClient.getQueryData<LibraryCreatorHeader>(headerKey);
    if (before?.status.follow) {
      queryClient.setQueryData<LibraryCreatorHeader>(headerKey, {
        ...before,
        status: { ...before.status, follow: { ...before.status.follow, ...patch } },
      });
    }
    try {
      await update.mutateAsync({ handle, ...patch });
    } catch {
      if (before) queryClient.setQueryData(headerKey, before);
      toast.add({ type: "error", title: C.toasts.failed });
    }
  };

  const onUnfollow = async () => {
    try {
      const { restoreToken } = await unfollow.mutateAsync({ handle });
      onOpenChange(false);
      void refreshLibrary();
      navigate(LIBRARY_PATHS.home);
      toast.add({
        type: "success",
        title: S.unfollowed(name),
        duration: 8000,
        actionProps: restoreToken
          ? {
              children: S.undo,
              onClick: () => {
                void undoUnfollow
                  .mutateAsync({ token: restoreToken })
                  .then(() => {
                    void refreshLibrary();
                    navigate(LIBRARY_PATHS.creator(handle));
                  })
                  .catch(() => toast.add({ type: "error", title: S.undoGone }));
              },
            }
          : undefined,
      });
    } catch {
      toast.add({ type: "error", title: C.toasts.failed });
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent title={S.title(name)}>
        <div className="space-y-[21px] px-[21px] pb-[21px]">
          <p className="text-prism-body text-prism-ink-2">{SECTION.ownership(name)}</p>
          {header.status.purchases.count > 0 && (
            <section aria-labelledby="status-purchases" className="space-y-1">
              <h3 id="status-purchases" className="text-prism-eyebrow uppercase text-prism-ink-3">
                {S.purchases}
              </h3>
              <p className="text-prism-body text-prism-ink">
                {C.connection.purchases(header.status.purchases.count)}
              </p>
            </section>
          )}
          {follow && (
            <section aria-labelledby="status-following" className="space-y-1">
              <h3 id="status-following" className="text-prism-eyebrow uppercase text-prism-ink-3">
                {S.following}
              </h3>
              <ToggleRow
                id="status-show-publicly"
                label={S.showPublicly(name)}
                help={S.showPubliclyHelp}
                checked={follow.showPublicly}
                onChange={checked => void setFollow({ showPublicly: checked })}
              />
              <ToggleRow
                id="status-email-updates"
                label={S.emailUpdates(name)}
                help={S.emailUpdatesHelp}
                checked={follow.emailUpdates}
                onChange={checked => void setFollow({ emailUpdates: checked })}
              />
              <div className="pt-2">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => void onUnfollow()}
                  disabled={unfollow.isPending}
                >
                  {S.unfollow}
                </Button>
              </div>
            </section>
          )}
          <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
            {S.close}
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}

/** A setting row whose state also reads as On or Off in words (fl-q2). */
function ToggleRow({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const S = C.statusSheet;
  return (
    <div className="flex min-h-[64px] items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className="text-prism-label font-semibold text-prism-ink">
          {label}
        </p>
        <p id={`${id}-help`} className="text-prism-meta text-prism-ink-2">
          {help}
        </p>
      </div>
      <span
        aria-hidden
        className={cn(
          "w-8 text-right text-prism-meta font-semibold",
          checked ? "text-prism-ink" : "text-prism-ink-2"
        )}
      >
        {checked ? S.on : S.off}
      </span>
      <Switch
        id={id}
        checked={checked}
        onChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
      />
    </div>
  );
}
