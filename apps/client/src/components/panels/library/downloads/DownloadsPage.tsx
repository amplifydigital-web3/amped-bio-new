/**
 * Downloads (Build Board #26, FL-5, board m10, Screen Review row 129, spec 3.5
 * Offline, decision C). The device line with a storage meter, Download on
 * Wi-Fi only (on by default), each copy with swipe left to remove, and Clear
 * all behind a confirm. Copies removed at the last check are named once.
 *
 * The same screen serves the Library online and the offline page
 * (OfflineDownloads), so it reads only what is on the device.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router";
import { Download, ExternalLink, HardDrive, Smartphone, Trash2, WifiOff } from "lucide-react";
import type { LibraryItem } from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  MediaPlayer,
  Notice,
  Switch,
  cn,
  type PlayerItem,
  type SourceResolver,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { LIBRARY_COPY } from "../copy";
import { LIBRARY_PATHS } from "../paths";
import { ItemCover, OwnerLine } from "../parts";
import {
  canPromptInstall,
  isIosSafari,
  onInstallChange,
  promptInstall,
  runningInstalled,
} from "./appWorker";
import {
  DownloadFailed,
  clearAll,
  dismissRemoved,
  downloadProgress,
  fileKey,
  findDownload,
  knowsConnectionType,
  localSource,
  offlineWindowOpen,
  readIndex,
  removeStored,
  setWifiOnly,
  startDownload,
  storageEstimate,
  useDownloadsVersion,
  wifiOnly,
  type DownloadsApi,
  type StoredDownload,
} from "./store";

const D = LIBRARY_COPY.downloads;

/** 1.2 GB, 340 MB, 12 KB */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** The message for a failed download. */
export function downloadErrorMessage(error: unknown): string {
  if (error instanceof DownloadFailed) {
    return error.reason === "refused" && error.message !== "refused"
      ? error.message
      : D.errors[error.reason];
  }
  return D.errors.network;
}

/** Download and Remove download for one item, with the progress for the menu and rows. */
export function useDownloadAction(api: DownloadsApi, account: number | null, item: LibraryItem) {
  useDownloadsVersion();
  const stored = account === null ? null : findDownload(account, item.publicId);
  const running = downloadProgress(item.publicId);
  const percent =
    running?.total && running.total > 0
      ? Math.min(99, Math.round((running.received / running.total) * 100))
      : null;
  return {
    stored,
    downloading: !!running,
    percent,
    start: async () => {
      if (account === null) return;
      try {
        await startDownload(api, account, item);
        toast.add({ type: "success", title: D.downloaded });
      } catch (error) {
        toast.add({ type: "error", title: downloadErrorMessage(error) });
      }
    },
    remove: async () => {
      if (account === null) return;
      await removeStored(api, account, item.publicId);
      toast.add({ type: "success", title: D.removed });
    },
  };
}

function useStorage() {
  const version = useDownloadsVersion();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void storageEstimate().then(value => !cancelled && setEstimate(value));
    return () => {
      cancelled = true;
    };
  }, [version]);
  return estimate;
}

function DeviceLine() {
  const estimate = useStorage();
  const used = estimate ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)) : 0;
  return (
    <div className="space-y-2 rounded-prism-13 bg-white/70 px-[13px] py-[13px] shadow-prism-e1">
      <p className="flex items-center gap-2 text-[15px] text-prism-ink">
        <HardDrive aria-hidden className="h-5 w-5 text-prism-ink-2" strokeWidth={1.5} />
        {estimate
          ? D.device(
              formatBytes(estimate.usage),
              formatBytes(Math.max(0, estimate.quota - estimate.usage))
            )
          : D.deviceUnknown}
      </p>
      {estimate && (
        <div
          role="meter"
          aria-label={D.meter}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={used}
          className="h-2 overflow-hidden rounded-full bg-prism-ink/10"
        >
          <div
            className="h-full rounded-full bg-prism-nav"
            style={{ width: `${Math.max(used, 1)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function WifiSetting() {
  useDownloadsVersion();
  const known = knowsConnectionType();
  return (
    <Switch
      checked={wifiOnly()}
      onChange={setWifiOnly}
      label={D.wifiOnly}
      description={known ? D.wifiHelp : D.wifiUnknown}
    />
  );
}

/** Install the app, where the browser offers it; the Share sheet line on iPhone. */
function InstallCard() {
  const [, rerender] = useState(0);
  useEffect(() => onInstallChange(() => rerender(n => n + 1)), []);
  if (runningInstalled()) return null;
  const prompt = canPromptInstall();
  const ios = isIosSafari();
  if (!prompt && !ios) return null;
  return (
    <div className="flex items-start gap-3 rounded-prism-13 bg-white/70 px-[13px] py-[13px] shadow-prism-e1">
      <Smartphone
        aria-hidden
        className="mt-0.5 h-5 w-5 shrink-0 text-prism-ink-2"
        strokeWidth={1.5}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[15px] font-semibold text-prism-ink">{D.install.title}</p>
        <p className="text-[14px] text-prism-ink-2">{prompt ? D.install.body : D.install.ios}</p>
      </div>
      {prompt && (
        <Button variant="secondary" onClick={() => void promptInstall()}>
          {D.install.button}
        </Button>
      )}
    </div>
  );
}

const REVEAL = 96;

/** One copy. Swipe left reveals Remove; the trash button does the same for every input. */
function DownloadRow({
  entry,
  online,
  onOpen,
  onRemove,
}: {
  entry: StoredDownload;
  online: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const cover =
    online && entry.cover ? { src: entry.cover, srcSet: "", width: null, height: null } : null;

  const down = (event: ReactPointerEvent) => {
    if (event.pointerType === "mouse") return;
    drag.current = { x: event.clientX, start: offset, moved: false };
  };
  const move = (event: ReactPointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    if (Math.abs(dx) > 8) state.moved = true;
    setOffset(Math.max(-REVEAL, Math.min(0, state.start + dx)));
  };
  const up = () => {
    if (!drag.current) return;
    setOffset(value => (value < -REVEAL / 2 ? -REVEAL : 0));
    setTimeout(() => (drag.current = null), 0);
  };

  return (
    <li className="relative overflow-hidden rounded-prism-13">
      <button
        type="button"
        tabIndex={offset === -REVEAL ? 0 : -1}
        aria-hidden={offset !== -REVEAL}
        onClick={onRemove}
        className="absolute inset-y-0 right-0 flex w-[96px] items-center justify-center bg-prism-danger text-[15px] font-semibold text-white"
        style={{ visibility: offset < 0 ? "visible" : "hidden" }}
      >
        {D.removeShort}
      </button>
      <div
        className="relative flex touch-pan-y items-center gap-1 rounded-prism-13 bg-white pr-2 transition-transform duration-prism-hover ease-prism motion-reduce:transition-none"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <button
          type="button"
          onClick={() => {
            if (drag.current?.moved || offset !== 0) {
              setOffset(0);
              return;
            }
            onOpen();
          }}
          className="prism-focus flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-prism-13 px-2 py-2 text-left"
        >
          <ItemCover
            item={{ cover, blur: null, kind: entry.kind }}
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-prism-13"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-semibold text-prism-ink">
              {entry.title}
            </span>
            <OwnerLine owner={entry.owner} className="text-[14px] text-prism-ink-2" />
            <span className="block text-[13px] text-prism-ink-2">{formatBytes(entry.bytes)}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={D.remove(entry.title)}
          onClick={onRemove}
          className="prism-icon-btn prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-full"
        >
          <Trash2 aria-hidden className="h-5 w-5 text-prism-ink-2" strokeWidth={1.5} />
        </button>
      </div>
    </li>
  );
}

function RemovedNotice({ account }: { account: number }) {
  const index = readIndex(account);
  if (!index.removed.length) return null;
  const reasons = [...new Set(index.removed.map(entry => entry.reason))];
  return (
    <Notice variant="warning" title={D.removedTitle(index.removed.length)} role="status">
      <ul className="list-disc space-y-0.5 pl-5">
        {index.removed.slice(0, 5).map((entry, i) => (
          <li key={`${entry.title}-${i}`}>
            {entry.title}. {D.removedBody[entry.reason]}.
          </li>
        ))}
      </ul>
      {reasons.length > 0 && (
        <Button variant="ghost" className="-ml-3 mt-1" onClick={() => dismissRemoved(account)}>
          {D.dismiss}
        </Button>
      )}
    </Notice>
  );
}

export function DownloadsPage({
  account,
  online,
  api,
  openItem,
}: {
  account: number;
  online: boolean;
  api: DownloadsApi | null;
  /** Opens a copy; defaults to the Library's download view */
  openItem?: (entry: StoredDownload) => void;
}) {
  useDownloadsVersion();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const index = readIndex(account);
  const windowOpen = offlineWindowOpen(index);
  const open =
    openItem ?? ((entry: StoredDownload) => navigate(LIBRARY_PATHS.download(entry.publicId)));

  return (
    <div className="space-y-[21px]">
      <h1 className="text-[28px] font-semibold leading-tight text-prism-ink">{D.title}</h1>
      {!online && (
        <Notice variant="info" title={D.offlineTitle} role="status">
          {D.offline}
        </Notice>
      )}
      <RemovedNotice account={account} />
      {!windowOpen && index.items.length > 0 && (
        <Notice variant="warning" title={D.windowClosedTitle}>
          {D.windowClosed}
        </Notice>
      )}
      <DeviceLine />
      <WifiSetting />
      <InstallCard />

      {index.items.length === 0 ? (
        <EmptyState icon={Download} title={D.emptyTitle} description={D.empty} />
      ) : (
        <section aria-labelledby="downloads-list" className="space-y-2">
          <div className="flex min-h-touch items-center justify-between">
            <h2 id="downloads-list" className="text-[20px] font-semibold text-prism-ink">
              {LIBRARY_COPY.downloadsTile(index.items.length)}
            </h2>
            <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
              {D.clearAll}
            </Button>
          </div>
          <ul className="space-y-1">
            {index.items.map(entry => (
              <DownloadRow
                key={entry.publicId}
                entry={entry}
                online={online}
                onOpen={() => open(entry)}
                onRemove={() => {
                  void removeStored(api, account, entry.publicId).then(() =>
                    toast.add({ type: "success", title: D.removed })
                  );
                }}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="text-[14px] text-prism-ink-2">{D.rules}</p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{D.clearTitle}</DialogTitle>
            <DialogDescription>{D.clearBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              {D.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                void clearAll(api, account).then(() =>
                  toast.add({ type: "success", title: D.cleared })
                );
              }}
            >
              {D.clearConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A copy opened from Downloads. Video and audio play from the device in the
 * shared player; documents and files open from the device in a new tab.
 */
export function DownloadItemView({
  account,
  publicId,
  online,
}: {
  account: number;
  publicId: string;
  online: boolean;
}) {
  useDownloadsVersion();
  const navigate = useNavigate();
  const entry = findDownload(account, publicId);
  const index = readIndex(account);

  if (!entry) {
    return (
      <EmptyState
        icon={WifiOff}
        title={LIBRARY_COPY.item.notFoundTitle}
        description={D.empty}
        action={<Button onClick={() => navigate(LIBRARY_PATHS.downloads)}>{D.title}</Button>}
      />
    );
  }
  if (!offlineWindowOpen(index)) {
    return (
      <Notice variant="warning" title={D.windowClosedTitle}>
        {D.windowClosed}
      </Notice>
    );
  }

  const heading = (
    <div className="space-y-1">
      <h2 className="text-[24px] font-semibold leading-tight text-prism-ink md:text-[28px]">
        {entry.title}
      </h2>
      <OwnerLine owner={entry.owner} className="text-[15px] text-prism-ink-2" />
    </div>
  );

  if (entry.kind === "video" || entry.kind === "audio") {
    const item: PlayerItem = {
      id: entry.publicId,
      kind: entry.kind,
      title: entry.title,
      subtitle: entry.owner.name || `@${entry.owner.handle}`,
      artwork: online ? entry.cover : null,
      durationMs: entry.durationMs,
      href: online
        ? LIBRARY_PATHS.item(entry.owner.handle, entry.publicId)
        : LIBRARY_PATHS.download(entry.publicId),
      ownerId: entry.owner.handle,
    };
    const resolve: SourceResolver = async () => {
      const source = localSource(account, publicId);
      if (!source) throw new Error("not on this device");
      return source;
    };
    return (
      <div className="space-y-[13px]">
        <MediaPlayer
          item={item}
          resolve={resolve}
          poster={online ? entry.cover : null}
          creatorName={item.subtitle}
          onMinimize={() => navigate(-1)}
        />
        {heading}
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      {heading}
      <Button asChild>
        <a href={fileKey(entry.publicId)} target="_blank" rel="noopener">
          {D.openFile}
          <ExternalLink aria-hidden />
        </a>
      </Button>
    </div>
  );
}

/** The Downloads half of the Saved and Downloads row (board m1). */
export function DownloadsTile({ account }: { account: number | null }) {
  useDownloadsVersion();
  const navigate = useNavigate();
  const count = account === null ? 0 : readIndex(account).items.length;
  return (
    <button
      type="button"
      onClick={() => navigate(LIBRARY_PATHS.downloads)}
      className={cn(
        "prism-focus flex min-h-[72px] w-full items-center gap-3 rounded-prism-13 bg-white/70 px-3 py-2 text-left shadow-prism-e1",
        "transition-colors duration-prism-hover ease-prism hover:bg-white"
      )}
    >
      <span className="flex h-touch w-touch shrink-0 items-center justify-center rounded-full bg-prism-nav-tint">
        <Download aria-hidden className="h-5 w-5 text-prism-ink" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-prism-ink">
          {LIBRARY_COPY.downloadsTitle}
        </span>
        <span className="block text-[14px] text-prism-ink-2">
          {count ? LIBRARY_COPY.downloadsTile(count) : LIBRARY_COPY.downloadsTileEmpty}
        </span>
      </span>
    </button>
  );
}
