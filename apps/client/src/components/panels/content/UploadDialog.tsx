import { useRef, useState, type ReactNode } from "react";
import { Clock, CloudUpload, Pause, Play, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Notice,
  cn,
} from "@repo/ui";
import { CONTENT_ALLOWED_TYPES, CONTENT_UPLOAD_KINDS } from "@repo/constants";
import { CONTENT_COPY } from "./copy";
import { StatusPill } from "./parts";
import { KIND_ICONS } from "./lib/labels";
import {
  bytesLeft,
  formatBytes,
  formatLimit,
  minutesLeft,
  type StorageSnapshot,
} from "./lib/files";
import type { UploadEntry } from "./lib/uploadQueue";
import { rowView } from "./lib/rows";
import { useOnline } from "./lib/useOnline";
import { useUploads } from "./lib/uploads";

const ACCEPT = CONTENT_UPLOAD_KINDS.flatMap(kind =>
  CONTENT_ALLOWED_TYPES[kind].exts.map(ext => `.${ext}`)
).join(",");

function UploadRow({
  entry,
  onOpenItem,
}: {
  entry: UploadEntry;
  onOpenItem: (publicId: string) => void;
}) {
  const { queue } = useUploads();
  const view = rowView(entry);
  const Icon = (entry.kind && KIND_ICONS[entry.kind]) || CloudUpload;
  const phase = entry.upload?.phase;
  const sending = phase === "preparing" || phase === "uploading";
  const resumable = phase === "paused" || phase === "offline";
  const showBar =
    entry.upload && !entry.rejected && (sending || resumable || phase === "finishing");
  const pct = entry.upload
    ? Math.floor((entry.upload.loaded / Math.max(1, entry.upload.total)) * 100)
    : 0;
  const publicId = entry.upload?.publicId ?? null;
  const u = CONTENT_COPY.upload;

  let action: ReactNode = null;
  if (sending || phase === "waiting") {
    action = (
      <div className="flex gap-1">
        {sending && (
          <button
            type="button"
            className="prism-icon-btn prism-focus"
            aria-label={u.pause(entry.name)}
            onClick={() => queue.pause(entry.id)}
          >
            <Pause className="h-5 w-5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="prism-icon-btn prism-focus"
          aria-label={u.cancel(entry.name)}
          onClick={() => void queue.cancel(entry.id)}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );
  } else if (resumable) {
    action = (
      <div className="flex gap-1">
        <button
          type="button"
          className="prism-icon-btn prism-focus"
          aria-label={u.resume(entry.name)}
          onClick={() => queue.resume(entry.id)}
        >
          <Play className="h-5 w-5" aria-hidden />
        </button>
        <button
          type="button"
          className="prism-icon-btn prism-focus"
          aria-label={u.cancel(entry.name)}
          onClick={() => void queue.cancel(entry.id)}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );
  } else if (phase === "failed" && !entry.rejected) {
    action = (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => queue.retry(entry.id)}>
          {u.retry}
        </Button>
        <button
          type="button"
          className="prism-icon-btn prism-focus"
          aria-label={u.cancel(entry.name)}
          onClick={() => void queue.cancel(entry.id)}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    );
  } else if (view.stage === "ready" || view.stage === "review") {
    action = publicId ? (
      <Button variant="ghost" onClick={() => onOpenItem(publicId)}>
        {u.details}
      </Button>
    ) : null;
  } else if (view.error) {
    action = (
      <Button variant="secondary" onClick={() => queue.dismiss(entry.id)}>
        {u.remove}
      </Button>
    );
  }

  return (
    <li className="flex items-start gap-[13px] border-t border-prism-line py-[13px] first:border-t-0">
      <span
        aria-hidden
        className="flex h-[55px] w-[55px] shrink-0 items-center justify-center overflow-hidden rounded-prism-13 bg-[#1C1B2E]"
      >
        {entry.previewUrl ? (
          <img src={entry.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-6 w-6 text-white/80" strokeWidth={1.5} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-prism-label font-bold text-prism-ink">
            {entry.name}
          </p>
          <StatusPill tone={view.tone} label={u.stage[view.stage]} />
        </div>
        <p
          className={cn(
            "mt-1 text-prism-meta",
            view.error ? "font-semibold text-prism-danger" : "text-prism-ink-2"
          )}
        >
          {view.line}
        </p>
        {showBar && (
          <div
            role="progressbar"
            aria-label={u.progressLabel(entry.name)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={u.progress(
              formatBytes(entry.upload!.loaded),
              formatBytes(entry.upload!.total)
            )}
            className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[rgba(22,21,43,0.10)]"
          >
            <span
              className={cn(
                "block h-full transition-[width] duration-300 motion-reduce:transition-none",
                resumable ? "bg-prism-warning-ink" : "bg-prism-nav"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

/**
 * Upload to Library (cs2, cs8 offline). Files go straight to storage; the
 * dialog only shows the queue, so closing it keeps uploads going.
 */
export function UploadDialog({
  open,
  onOpenChange,
  storage,
  onOpenItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storage: StorageSnapshot;
  onOpenItem: (publicId: string) => void;
}) {
  const { queue, entries } = useUploads();
  const online = useOnline();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const u = CONTENT_COPY.upload;
  const limits = storage.limits;
  const paused =
    !online && entries.some(e => e.upload?.phase === "offline" || e.upload?.phase === "waiting");

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void queue.add(Array.from(list), storage);
  };

  const close = (next: boolean) => {
    if (!next) queue.clearSettled();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="gap-[21px]">
        <DialogHeader>
          <DialogTitle>{u.title}</DialogTitle>
          <DialogDescription className="sr-only">{u.rightsBody}</DialogDescription>
        </DialogHeader>

        <div
          onDragOver={event => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-start gap-[13px] rounded-prism-21 border-[1.5px] border-dashed border-prism-nav/50 bg-white/50 p-[13px] sm:flex-row sm:items-center",
            dragging && "border-solid !shadow-[0_0_0_1.5px_#5650A2]"
          )}
        >
          <span
            aria-hidden
            className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full bg-white shadow-prism-e1"
          >
            <CloudUpload className="h-6 w-6 text-prism-nav" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-prism-label font-bold text-prism-ink">{u.drop}</p>
            <p className="text-prism-meta text-prism-ink-2">{u.dropTypes}</p>
          </div>
          <Button variant="secondary" onClick={() => input.current?.click()}>
            {u.choose}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={event => {
              addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>

        <dl className="grid grid-cols-2 overflow-hidden rounded-prism-13 border border-prism-line bg-white/60 text-prism-body">
          {(
            [
              [u.limits.video, limits.video],
              [u.limits.audioZip, Math.max(limits.audio, limits.file)],
              [u.limits.document, limits.document],
              [u.limits.image, limits.image],
            ] as const
          ).map(([label, bytes], i) => (
            <div
              key={label}
              className={cn(
                "flex items-center justify-between gap-2 px-[13px] py-[10px]",
                i % 2 === 1 && "border-l border-prism-line",
                i > 1 && "border-t border-prism-line"
              )}
            >
              <dt className="text-prism-ink-2">{label}</dt>
              <dd className="font-semibold tabular-nums text-prism-ink">{formatLimit(bytes)}</dd>
            </div>
          ))}
        </dl>

        <p className="-mt-2 flex items-center gap-2 text-prism-meta font-semibold text-prism-ink">
          {u.spaceLeft(formatBytes(bytesLeft(storage)), minutesLeft(storage))}
        </p>

        <div className="flex items-start gap-3 rounded-prism-13 border border-prism-nav/30 bg-prism-nav-tint px-3 py-3">
          <ShieldCheck className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" aria-hidden />
          <div className="text-prism-body text-prism-ink">
            <p className="font-bold">{u.rightsTitle}</p>
            <p>{u.rightsBody}</p>
          </div>
        </div>

        {entries.length > 0 && (
          <ul aria-label={u.listLabel} className="-my-2">
            {entries.map(entry => (
              <UploadRow
                key={entry.id}
                entry={entry}
                onOpenItem={publicId => {
                  close(false);
                  onOpenItem(publicId);
                }}
              />
            ))}
          </ul>
        )}

        {/* Announces stage changes only, never each percent of progress */}
        <p className="sr-only" aria-live="polite">
          {entries.map(entry => `${entry.name}: ${u.stage[rowView(entry).stage]}`).join(". ")}
        </p>

        {paused && (
          <Notice variant="warning" title={u.offlineTitle} role="status">
            {u.offlineBody}
          </Notice>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
            <Clock className="h-4 w-4" aria-hidden />
            {u.closing}
          </p>
          {paused ? (
            <Button size="lg" onClick={() => queue.retryNow()}>
              <RefreshCw aria-hidden />
              {u.retryNow}
            </Button>
          ) : (
            <Button size="lg" onClick={() => close(false)}>
              {u.done}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
