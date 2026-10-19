import { useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, Upload } from "lucide-react";
import { Button, ChipGroup, EmptyState, ErrorCard, Notice, Skeleton, trpc } from "@repo/ui";
import type { ContentKindName } from "@repo/constants";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { CONTENT_COPY } from "./copy";
import { ItemCard, type LibraryItem } from "./ItemCard";
import { KindTile } from "./parts";
import { StorageMeter } from "./StorageMeter";
import { UploadDialog } from "./UploadDialog";
import { formatLimit, type StorageSnapshot } from "./lib/files";
import { messageForApiError } from "./lib/uploadTask";
import { contentUploadApi } from "./lib/browserDeps";
import { refreshContent, useUploads } from "./lib/uploads";
import { isSettling } from "./lib/status";

type Filter = "all" | "video" | "audio" | "image" | "document" | "file" | "drafts";

const FILTER_INPUT: Record<Filter, { kind?: ContentKindName; publishState?: "draft" }> = {
  all: {},
  video: { kind: "video" },
  audio: { kind: "audio" },
  image: { kind: "image" },
  document: { kind: "document" },
  file: { kind: "file" },
  drafts: { publishState: "draft" },
};

export const PAGE_SIZE = 30;
const POLL_MS = 5000;

function GridSkeleton() {
  return (
    <div aria-busy aria-label={CONTENT_COPY.library.loading} className="space-y-[13px]">
      <div className="grid grid-cols-1 gap-[21px] sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="prism-glass-clear space-y-3 !rounded-prism-21 p-[13px]">
            <Skeleton className="aspect-[16/9] w-full rounded-prism-13 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-2/3 rounded-full motion-reduce:animate-none" />
            <Skeleton className="h-4 w-1/3 rounded-full motion-reduce:animate-none" />
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-prism-meta text-prism-ink-2">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {CONTENT_COPY.library.loading}
      </p>
    </div>
  );
}

/**
 * Content, Library tab (cs1, cs8). The meter, search, filters and the grid of
 * items. Items still processing are polled until the server settles them.
 */
export function LibraryView({ onOpenItem }: { onOpenItem: (publicId: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { entries } = useUploads();
  const l = CONTENT_COPY.library;

  const storage = useQuery(trpc.content.getStorage.queryOptions());
  const list = useInfiniteQuery(
    trpc.content.list.infiniteQueryOptions(
      { limit: PAGE_SIZE, ...FILTER_INPUT[filter] },
      {
        getNextPageParam: last => last.nextCursor ?? undefined,
        placeholderData: keepPreviousData,
        refetchInterval: query =>
          query.state.data?.pages.some(page => page.items.some(isSettling)) ? POLL_MS : false,
      }
    )
  );
  const showSkeleton = useDelayed(list.isLoading, 300);

  const remove = useMutation({
    // abortUpload doubles as "remove a failed item" (content router, PR 2)
    mutationFn: (item: LibraryItem) => contentUploadApi.abortUpload({ publicId: item.publicId }),
    onSuccess: (_data, item) => {
      toast.add({ type: "success", title: CONTENT_COPY.card.removed(item.title) });
      refreshContent(item.publicId);
    },
    onError: error =>
      toast.add({
        type: "error",
        title: CONTENT_COPY.card.removeFailed,
        description: messageForApiError(error),
      }),
  });

  const items = useMemo(() => {
    // Read through unknown: the Json columns make the inferred item type too deep to map
    const pages = (list.data?.pages ?? []) as unknown as { items: LibraryItem[] }[];
    const all = pages.flatMap(page => page.items);
    const needle = search.trim().toLowerCase();
    return needle ? all.filter(item => item.title.toLowerCase().includes(needle)) : all;
  }, [list.data, search]);

  // Only a file still being handled blocks Remove; a failed or blocked item must
  // remain removable from the card, even while its row is in the dialog
  const queued = new Set(
    entries
      .filter(e => e.server?.status !== "failed" && e.server?.status !== "blocked")
      .map(e => e.upload?.publicId)
      .filter(Boolean)
  );
  const snapshot: StorageSnapshot | null = storage.data
    ? {
        bytesLimit: storage.data.bytesLimit,
        bytesUsed: storage.data.bytesUsed,
        bytesReserved: storage.data.bytesReserved,
        videoMinutesLimit: storage.data.videoMinutesLimit,
        videoMinutesUsed: storage.data.videoMinutesUsed,
        limits: storage.data.limits,
      }
    : null;
  const uploadsOpen = storage.data?.uploadsOpen ?? false;
  const libraryEmpty =
    filter === "all" && !search && !list.isLoading && !list.isError && items.length === 0;

  const uploadButton = (size: "default" | "lg" = "lg") => (
    <Button
      size={size}
      onClick={() => setUploadOpen(true)}
      disabled={!uploadsOpen || !snapshot}
      title={uploadsOpen ? undefined : l.uploadsClosed}
    >
      <Upload aria-hidden />
      {l.upload}
    </Button>
  );

  const limitsLine = snapshot
    ? l.limitsLine(
        `Video ${formatLimit(snapshot.limits.video)}, audio and ZIP ${formatLimit(
          Math.max(snapshot.limits.audio, snapshot.limits.file)
        )}, documents ${formatLimit(snapshot.limits.document)}, images ${formatLimit(
          snapshot.limits.image
        )}`,
        `${formatLimit(snapshot.bytesLimit)} and ${snapshot.videoMinutesLimit} video minutes`
      )
    : null;

  return (
    <div className="space-y-[21px] font-prism">
      {storage.isError ? (
        <ErrorCard
          title={CONTENT_COPY.meter.loadError}
          cause={l.loadErrorCause}
          onRetry={() => void storage.refetch()}
        />
      ) : storage.data ? (
        <StorageMeter data={storage.data} />
      ) : (
        <Skeleton className="h-[110px] rounded-prism-21 motion-reduce:animate-none" />
      )}

      {storage.data && !uploadsOpen && (
        <Notice variant="info" title={l.uploadsClosed} role="status">
          {l.uploadsClosedBody}
        </Notice>
      )}

      {libraryEmpty ? (
        <div className="prism-glass-clear flex min-h-[377px] flex-col items-center justify-center gap-[13px] !rounded-prism-21 px-5 py-[34px] text-center">
          <div aria-hidden className="flex gap-[13px]">
            {(["video", "audio", "document"] as const).map(kind => (
              <KindTile key={kind} kind={kind} className="!aspect-square w-[89px]" />
            ))}
          </div>
          <h2 className="mt-[8px] text-prism-panel-title text-prism-ink">{l.emptyTitle}</h2>
          <p className="max-w-[46ch] text-prism-body text-prism-ink-2">{l.emptyBody}</p>
          <div className="mt-[8px]">{uploadButton()}</div>
          {limitsLine && (
            <p className="max-w-[55ch] text-prism-meta text-prism-ink-2">{limitsLine}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[13px] md:flex-row md:items-center">
            <label className="prism-well flex h-touch min-w-0 flex-1 items-center gap-2 px-[13px] focus-within:shadow-[0_0_0_1.5px_#0B5A80] md:max-w-[480px]">
              <Search className="h-5 w-5 shrink-0 text-prism-ink-2" aria-hidden />
              <span className="sr-only">{l.search}</span>
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={l.search}
                className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-2"
              />
            </label>
            <span className="text-prism-meta text-prism-ink-2" aria-live="polite">
              {list.data ? l.count(items.length) : null}
            </span>
            <div className="md:ml-auto">{uploadButton()}</div>
          </div>

          <ChipGroup<Filter>
            label={l.filtersLabel}
            value={filter}
            onChange={setFilter}
            className="flex-nowrap overflow-x-auto pb-1 md:flex-wrap"
            options={[
              { value: "all", label: CONTENT_COPY.filters.all },
              { value: "video", label: CONTENT_COPY.filters.video },
              { value: "audio", label: CONTENT_COPY.filters.audio },
              { value: "image", label: CONTENT_COPY.filters.image },
              { value: "document", label: CONTENT_COPY.filters.document },
              { value: "file", label: CONTENT_COPY.filters.file },
              { value: "drafts", label: CONTENT_COPY.filters.drafts },
            ]}
          />

          {list.isError ? (
            <ErrorCard
              title={l.loadError}
              cause={l.loadErrorCause}
              onRetry={() => void list.refetch()}
            />
          ) : list.isLoading ? (
            showSkeleton ? (
              <GridSkeleton />
            ) : null
          ) : items.length === 0 ? (
            <div className="prism-glass-clear flex min-h-[233px] items-center justify-center !rounded-prism-21">
              <EmptyState
                icon={Search}
                title={l.noMatchTitle}
                description={l.noMatchBody}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilter("all");
                      setSearch("");
                    }}
                  >
                    {l.clear}
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-[21px] sm:grid-cols-2 xl:grid-cols-4">
              {items.map(item => (
                <li key={item.publicId} className="flex">
                  <ItemCard
                    item={item}
                    onOpen={() => onOpenItem(item.publicId)}
                    onRemove={() => remove.mutate(item)}
                    canRemove={
                      (item.status === "failed" || item.status === "uploading") &&
                      !queued.has(item.publicId)
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {list.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                aria-busy={list.isFetchingNextPage || undefined}
              >
                {l.more}
              </Button>
            </div>
          )}
        </>
      )}

      {snapshot && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          storage={snapshot}
          onOpenItem={onOpenItem}
        />
      )}
    </div>
  );
}
