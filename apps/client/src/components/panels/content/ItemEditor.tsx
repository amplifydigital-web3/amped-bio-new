import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Cloud, CloudOff, Globe, Loader2, Plus, X } from "lucide-react";
import {
  Button,
  ErrorCard,
  Input,
  Notice,
  Skeleton,
  Switch,
  Textarea,
  cn,
  queryClient,
  trpc,
  trpcClient,
} from "@repo/ui";
import { CONTENT_CHAPTERS_MAX, CONTENT_DESCRIPTION_MAX, CONTENT_TITLE_MAX } from "@repo/constants";
import { CONTENT_COPY } from "./copy";
import { LaterPill, StatusPill } from "./parts";
import { EYEBROW_NAV, kindBadge } from "./lib/labels";
import { nextRowKey, rowsToChapters, toRows, type Chapter, type ChapterRow } from "./lib/chapters";
import { failureLine, itemStatus } from "./lib/status";
import { normalizeApiError } from "./lib/browserDeps";
import { refreshContent } from "./lib/uploads";
import { useAutosave, type AutosaveStatus } from "./lib/useAutosave";
import { takeDeferred } from "./lib/deferredSaves";

type Patch = {
  title?: string;
  description?: string | null;
  allowDownload?: boolean;
  adult?: boolean;
  chapters?: Chapter[] | null;
};
/** The fields of content.get the editor reads. Json columns are read as unknown. */
interface EditorItem {
  publicId: string;
  kind: string;
  title: string;
  description: string | null;
  status: "uploading" | "processing" | "ready" | "failed" | "blocked" | "deleted";
  publishState: "draft" | "published" | "archived";
  moderationState: "pending" | "clear" | "held" | "blocked";
  processingStep: string | null;
  failureReason: string | null;
  allowDownload: boolean;
  adult: boolean;
  chapters: unknown;
  durationMs: number | null;
  pageCount: number | null;
  totalBytes: number;
}

const e = CONTENT_COPY.editor;
function SaveStatus({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  if (status.state === "idle") return <span role="status" />;
  if (status.state === "saving") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {e.saving}
      </span>
    );
  }
  if (status.state === "saved") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
        <Cloud className="h-4 w-4" aria-hidden />
        {e.saved(format(status.at, "HH:mm"))}
      </span>
    );
  }
  if (status.state === "offline") {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 text-prism-meta text-prism-warning-ink"
      >
        <CloudOff className="h-4 w-4" aria-hidden />
        {e.offline}
      </span>
    );
  }
  return (
    <span
      role="status"
      className="flex items-center gap-2 text-prism-meta font-semibold text-prism-danger"
    >
      {e.saveFailed}
      <Button variant="secondary" onClick={onRetry}>
        {e.retrySave}
      </Button>
    </span>
  );
}

const RULES = ["everyone", "followers", "members", "pool", "stake", "paid", "any"] as const;

/** Who can open this (cs3). PR 5 is Public only; the other rules show Later (spec 3.16). */
function AccessCard() {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]"
    >
      <p className={EYEBROW_NAV}>{e.accessEyebrow}</p>
      <h2 id={headingId} className="text-prism-panel-title text-prism-ink">
        {e.accessTitle}
      </h2>
      <div role="radiogroup" aria-labelledby={headingId} className="space-y-1">
        {RULES.map(rule => {
          const [label, help] = e.rules[rule]!;
          const selected = rule === "everyone";
          return (
            <div
              key={rule}
              role="radio"
              aria-checked={selected}
              aria-disabled={!selected}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "flex min-h-touch items-center gap-3 rounded-prism-13 px-[13px] py-[8px]",
                selected && "bg-white/70 shadow-[0_0_0_1.5px_#5650A2]"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  selected ? "border-prism-nav" : "border-[rgba(22,21,43,0.56)]"
                )}
              >
                {selected && <span className="h-[11px] w-[11px] rounded-full bg-prism-nav" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-prism-label font-semibold text-prism-ink">{label}</span>
                <span className="block text-prism-meta text-prism-ink-2">{help}</span>
              </span>
              {selected ? (
                <Globe className="h-5 w-5 shrink-0 text-prism-ink-2" aria-hidden />
              ) : (
                <LaterPill />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-prism-meta text-prism-ink-2">{e.accessNote}</p>
    </section>
  );
}

/**
 * Item editor (cs3, cs8 processing failed). Title, description, chapters,
 * downloads and the 18+ label save as the creator types. Cover, captions,
 * preview length, Sell in store and Preview as arrive with the PRs that serve
 * files (PR 6) and gate them (PR 8).
 */
export function ItemEditor({ publicId, onBack }: { publicId: string; onBack: () => void }) {
  const query = useQuery({
    ...trpc.content.get.queryOptions({ publicId }),
    // Poll while the server is still working on the file
    refetchInterval: q => (q.state.data?.status === "processing" ? 5000 : false),
  });
  const item = {
    data: query.data as EditorItem | undefined,
    isError: query.isError,
    error: query.error as unknown,
    refetch: query.refetch,
  };

  const autosave = useAutosave<Patch>(
    async patch => {
      try {
        const updated = (await trpcClient.content.update.mutate({
          publicId,
          ...patch,
        })) as unknown as Partial<EditorItem>;
        // Keep the cached item (and its assets) in step without a refetch
        const key: readonly unknown[] = trpc.content.get.queryKey({ publicId });
        queryClient.setQueryData<EditorItem>(key, old => (old ? { ...old, ...updated } : old));
        refreshContent();
      } catch (error) {
        throw normalizeApiError(error);
      }
    },
    { deferKey: publicId }
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<ChapterRow[]>([]);
  const [allowDownload, setAllowDownload] = useState(false);
  const [adult, setAdult] = useState(false);
  const [chapterError, setChapterError] = useState(false);
  const loaded = useRef<string | null>(null);

  // Fill the fields once per item; later refetches never overwrite what is being typed
  useEffect(() => {
    if (!item.data || loaded.current === publicId) return;
    loaded.current = publicId;
    // Edits from an earlier visit that have not reached the server yet win
    const unsent = takeDeferred(publicId) as Patch | null;
    const view = { ...item.data, ...(unsent ?? {}) };
    setTitle(view.title);
    setDescription(view.description ?? "");
    setRows(toRows(view.chapters));
    setAllowDownload(view.allowDownload);
    setAdult(view.adult);
    if (unsent) autosave.change(unsent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data, publicId]);

  const back = async () => {
    await autosave.flush();
    onBack();
  };

  const changeRows = (next: ChapterRow[]) => {
    setRows(next);
    const chapters = rowsToChapters(next);
    setChapterError(chapters === null);
    if (chapters !== null) autosave.change({ chapters: chapters.length ? chapters : null });
  };

  const backButton = (
    <button
      type="button"
      onClick={() => void back()}
      className="prism-focus -ml-2 inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
    >
      <ChevronLeft className="h-5 w-5" aria-hidden />
      {e.back}
    </button>
  );

  if (item.isError) {
    const notFound = (item.error as { data?: { code?: string } })?.data?.code === "NOT_FOUND";
    return (
      <div className="space-y-[13px] font-prism">
        {backButton}
        <ErrorCard
          title={notFound ? e.notFound : e.loadError}
          cause={notFound ? undefined : CONTENT_COPY.library.loadErrorCause}
          onRetry={notFound ? undefined : () => void item.refetch()}
        />
      </div>
    );
  }

  if (!item.data) {
    return (
      <div
        className="space-y-[13px] font-prism"
        aria-busy
        aria-label={CONTENT_COPY.library.loading}
      >
        {backButton}
        <Skeleton className="h-[377px] rounded-prism-21 motion-reduce:animate-none" />
      </div>
    );
  }

  const data = item.data;
  const status = itemStatus(data);
  const timed = data.kind === "video" || data.kind === "audio";
  const titleError = title.trim() ? undefined : e.titleRequired;

  return (
    <div className="grid gap-[21px] font-prism lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="prism-glass-clear min-w-0 space-y-[21px] !rounded-prism-21 p-[21px] md:p-[34px]">
        <div className="flex flex-wrap items-center justify-between gap-[13px]">
          {backButton}
          <div className="flex items-center gap-[13px]">
            <span className="text-prism-meta text-prism-ink-2">{kindBadge(data)}</span>
            <StatusPill
              tone={status.key === "draft" && data.status === "ready" ? "ready" : status.tone}
              label={status.key === "draft" && data.status === "ready" ? e.ready : status.label}
            />
          </div>
        </div>

        {status.key === "processing" && (
          <Notice variant="info" title={e.processingTitle} role="status">
            {e.processingBody}
          </Notice>
        )}
        {status.key === "review" && (
          <Notice variant="warning" title={e.reviewTitle} role="status">
            {e.reviewBody}
          </Notice>
        )}
        {status.key === "failed" && (
          <Notice variant="error" title={e.failedTitle}>
            {failureLine(data.failureReason)} {e.failedKeep}
          </Notice>
        )}
        {status.key === "blocked" && (
          <Notice variant="error" title={e.blockedTitle}>
            {CONTENT_COPY.card.blockedLine}
          </Notice>
        )}

        <Input
          label={e.title}
          labelAction={
            <span className="text-prism-meta text-prism-ink-2">
              {e.count(title.length, CONTENT_TITLE_MAX)}
            </span>
          }
          value={title}
          maxLength={CONTENT_TITLE_MAX}
          error={titleError}
          onChange={event => {
            const next = event.target.value;
            setTitle(next);
            if (next.trim()) autosave.change({ title: next.trim() });
          }}
        />

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor={`desc-${publicId}`}
              className="text-prism-label font-semibold text-prism-ink"
            >
              {e.description}
            </label>
            <span className="text-prism-meta text-prism-ink-2">
              {e.count(description.length, CONTENT_DESCRIPTION_MAX)}
            </span>
          </div>
          <Textarea
            id={`desc-${publicId}`}
            rows={4}
            value={description}
            maxLength={CONTENT_DESCRIPTION_MAX}
            onChange={event => {
              const next = event.target.value;
              setDescription(next);
              autosave.change({ description: next.trim() ? next : null });
            }}
          />
        </div>

        {timed && (
          <section aria-labelledby={`chapters-${publicId}`} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3
                id={`chapters-${publicId}`}
                className="text-prism-label font-semibold text-prism-ink"
              >
                {e.chapters}
              </h3>
              <span className="text-prism-meta text-prism-ink-2">
                {e.chaptersCount(rows.length)}
              </span>
            </div>
            {rows.length > 0 && (
              <ol className="overflow-hidden rounded-prism-13 border border-prism-line bg-white/60">
                {rows.map((row, index) => (
                  <li
                    key={row.key}
                    className="flex items-center gap-2 border-t border-prism-line px-[8px] py-[6px] first:border-t-0"
                  >
                    <input
                      aria-label={e.chapterStart(index + 1)}
                      value={row.start}
                      inputMode="numeric"
                      placeholder="0:00"
                      onChange={event =>
                        changeRows(
                          rows.map(r =>
                            r.key === row.key ? { ...r, start: event.target.value } : r
                          )
                        )
                      }
                      className="prism-well prism-focus h-touch w-[84px] px-2 text-center text-prism-label tabular-nums text-prism-ink"
                    />
                    <input
                      aria-label={e.chapterTitle(index + 1)}
                      value={row.title}
                      maxLength={100}
                      onChange={event =>
                        changeRows(
                          rows.map(r =>
                            r.key === row.key ? { ...r, title: event.target.value } : r
                          )
                        )
                      }
                      className="prism-focus h-touch min-w-0 flex-1 rounded-prism-8 bg-transparent px-2 text-prism-label text-prism-ink"
                    />
                    <button
                      type="button"
                      aria-label={e.removeChapter(index + 1)}
                      className="prism-icon-btn prism-focus shrink-0"
                      onClick={() => changeRows(rows.filter(r => r.key !== row.key))}
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p
              className={cn(
                "text-prism-meta",
                chapterError ? "font-semibold text-prism-danger" : "text-prism-ink-2"
              )}
            >
              {chapterError ? e.chapterInvalid : e.chapterTimeHelp}
            </p>
            {rows.length < CONTENT_CHAPTERS_MAX && (
              <button
                type="button"
                onClick={() =>
                  // A new row is incomplete, so nothing saves until it has a start and a title
                  changeRows([
                    ...rows,
                    { key: nextRowKey(), start: rows.length ? "" : "0:00", title: "" },
                  ])
                }
                className="prism-focus -ml-2 inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
              >
                <Plus className="h-5 w-5" aria-hidden />
                {e.addChapter}
              </button>
            )}
          </section>
        )}

        <div className="divide-y divide-prism-line overflow-hidden rounded-prism-13 border border-prism-line bg-white/60">
          <div className="px-[13px] py-[8px]">
            <Switch
              checked={allowDownload}
              label={e.downloads}
              description={e.downloadsHelp}
              onChange={next => {
                setAllowDownload(next);
                autosave.change({ allowDownload: next });
              }}
            />
          </div>
          <div className="px-[13px] py-[8px]">
            <Switch
              checked={adult}
              label={e.adult}
              description={e.adultHelp}
              onChange={next => {
                setAdult(next);
                autosave.change({ adult: next });
              }}
            />
          </div>
        </div>
      </section>

      <div className="min-w-0 space-y-[21px]">
        <AccessCard />
        <div className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]">
          <SaveStatus status={autosave.status} onRetry={() => void autosave.flush()} />
          <p className="text-prism-meta text-prism-ink-2">{e.publishLater}</p>
        </div>
      </div>
    </div>
  );
}
