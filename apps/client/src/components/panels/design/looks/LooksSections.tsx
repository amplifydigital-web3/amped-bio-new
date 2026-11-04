import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  History,
  Link2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import { themeFileV2, type ThemeConfig } from "@repo/constants";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Skeleton,
  cn,
  themeFileName,
  trpc,
  trpcClient,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { toast } from "@/components/ui/toast";
import { CardMiniature, CreatorBackdrop } from "../kit/CreatorArt";
import { useThemeActions } from "../kit/useThemeActions";
import { ShareLookDialog } from "../share/ShareLookDialog";
import {
  LAYER_TARGETS,
  LIMIT_REASON,
  LOOKS_COPY,
  LOOK_LIMIT,
  forgetShared,
  limitLine,
  lookCostLine,
  openRowNext,
  readShared,
  savedLine,
  type SharedEntry,
} from "./looksLook";
import { pageCost, upgradeTheme } from "@repo/constants";

/**
 * Theme Engine v2 TE-4c, the Themes tab sections (spec 3.10, boards 04, 11,
 * 13): the current look card, My looks, Shared with me and Theme of the week.
 * Behind themeSharing; ThemesTab keeps the v1 layout with the flag off.
 */

type Look = {
  id: number;
  name: string | null;
  config: ThemeConfig | null;
  updated_at: string | Date | null;
  versions: number;
  share_slug: string | null;
};

export function useLooks() {
  return useQuery(trpc.theme.looks.queryOptions());
}

function useRefreshLooks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.theme.looks.queryKey() });
}

const DELETE_CONFIRM_MS = 5000;

/** The look as a small page: its background, card and button. */
export function LookArt({ config, className }: { config: ThemeConfig | null; className?: string }) {
  const c = config ?? ({} as ThemeConfig);
  return (
    <span className={cn("block aspect-[3/4] w-full overflow-hidden rounded-prism-13", className)}>
      <CreatorBackdrop background={c.background as never}>
        <span className="flex h-full w-full items-center justify-center">
          <CardMiniature config={c} containerStyle={c.containerStyle ?? 0} />
        </span>
      </CreatorBackdrop>
    </span>
  );
}

function downloadLook(name: string, config: ThemeConfig | null, handle: string | null) {
  const file = themeFileV2(name, handle, new Date(), config ?? {});
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${themeFileName(name)}.ampedtheme`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isLimit(error: unknown) {
  return String((error as { message?: string })?.message ?? "").includes("THEME_LIMIT");
}

/* ------------------------------------------------------------------------ */
/* Current look card (board 04, top)                                        */
/* ------------------------------------------------------------------------ */

export function CurrentLookCard({ onJump }: { onJump: (tab: "style" | "motion") => void }) {
  const { theme } = useEditor();
  const looks = useLooks();
  const refresh = useRefreshLooks();
  const { refetch, ensureSaved } = useThemeActions();
  const [shareOpen, setShareOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const own = theme.user_id !== null && theme.id > 0;
  const stored = looks.data?.looks.find(l => l.id === theme.id);
  const atLimit = (looks.data?.count ?? 0) >= LOOK_LIMIT;
  const parts = pageCost(upgradeTheme(theme.config ?? {})).parts;

  const saveAsNew = async () => {
    setBusy(true);
    try {
      await ensureSaved();
      await trpcClient.theme.createLook.mutate({
        name: name.trim() || "My look",
        config: theme.config,
      });
      setSaveOpen(false);
      await Promise.all([refresh(), refetch()]);
      toast.add({ type: "success", title: `${name.trim() || "My look"} saved and applied` });
    } catch (error) {
      toast.add({
        type: "error",
        title: isLimit(error) ? LIMIT_REASON : "Look not saved. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={LOOKS_COPY.current}
      className="prism-glass-clear mb-[21px] space-y-[13px] p-[13px]"
    >
      <div className="flex items-center gap-[13px]">
        <span className="w-[55px] shrink-0">
          <LookArt config={theme.config} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-prism-eyebrow uppercase text-prism-ink-2">{LOOKS_COPY.current}</p>
          <p className="truncate text-prism-label font-bold text-prism-ink">
            {theme.name || "My look"}
          </p>
          <p className="text-prism-meta text-prism-ink-2">
            {own ? savedLine(stored?.updated_at ?? null) : "Not saved as a look yet"}
          </p>
        </div>
      </div>

      {parts.length > 0 && (
        <div role="group" aria-label="Layers" className="flex flex-wrap gap-2">
          {parts.map(part => (
            <Chip
              key={`${part.layer}-${part.label}`}
              onClick={() => {
                const tab = openRowNext(part.layer);
                if (tab) onJump(tab);
              }}
              disabled={!LAYER_TARGETS[part.layer]}
            >
              {part.label}
            </Chip>
          ))}
        </div>
      )}
      <p className="text-prism-meta text-prism-ink-2">{lookCostLine(theme.config)}</p>

      <div className="flex flex-wrap gap-2">
        {own && (
          <Button variant="secondary" onClick={() => setShareOpen(true)}>
            <Link2 aria-hidden />
            {LOOKS_COPY.copyLink}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={atLimit}
          aria-describedby={atLimit ? "look-limit-reason" : undefined}
          onClick={() => {
            setName(theme.name ? `${theme.name}`.slice(0, 40) : "My look");
            setSaveOpen(true);
          }}
        >
          {LOOKS_COPY.saveAsNew}
        </Button>
      </div>
      {atLimit && (
        <p id="look-limit-reason" className="text-prism-meta text-prism-ink-2">
          {LIMIT_REASON}
        </p>
      )}

      {own && <ShareLookDialog lookId={theme.id} open={shareOpen} onOpenChange={setShareOpen} />}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{LOOKS_COPY.saveAsNew}</DialogTitle>
            <DialogDescription>
              Saves what your page looks like now as a new look and keeps editing that one.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={event => {
              event.preventDefault();
              void saveAsNew();
            }}
          >
            <Input
              label="Name"
              value={name}
              maxLength={40}
              onChange={event => setName(event.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy} aria-busy={busy}>
                Save look
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* My looks (board 04 shelf, board 11 horizontal on a phone)                */
/* ------------------------------------------------------------------------ */

export function MyLooksShelf({ onImport, mobile }: { onImport: () => void; mobile: boolean }) {
  const looks = useLooks();
  const { theme, setPreviewOverride } = useEditor();
  const { applyLook } = useThemeActions();
  const [applying, setApplying] = useState<number | null>(null);

  const apply = async (look: Look) => {
    if (look.id === looks.data?.appliedId) return;
    const before = theme.id;
    setApplying(look.id);
    try {
      await applyLook(look.id);
      setPreviewOverride(null);
      toast.add({
        type: "success",
        title: `${look.name || "Look"} applied`,
        duration: 8000,
        actionProps:
          before > 0
            ? { children: "Undo", onClick: () => void applyLook(before).catch(() => undefined) }
            : undefined,
      });
    } catch {
      toast.add({ type: "error", title: `${look.name || "Look"} was not applied.` });
    } finally {
      setApplying(null);
    }
  };

  const count = looks.data?.count ?? 0;
  return (
    <section aria-labelledby="my-looks" className="mb-[34px] space-y-[13px]">
      <div className="flex items-center justify-between gap-3">
        <h3 id="my-looks" className="text-prism-eyebrow uppercase text-prism-ink-2">
          {LOOKS_COPY.myLooks}{" "}
          <span className="tabular-nums normal-case">{looks.data ? limitLine(count) : ""}</span>
        </h3>
        <Button variant="ghost" className="min-h-touch" onClick={onImport}>
          <Upload aria-hidden />
          {LOOKS_COPY.importFile}
        </Button>
      </div>
      {looks.isPending ? (
        <div className="grid grid-cols-3 gap-[13px]" aria-hidden>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-prism-13" />
          ))}
        </div>
      ) : looks.isError ? (
        <p className="text-prism-meta text-prism-ink-2">
          Your looks did not load.{" "}
          <button
            className="prism-focus font-semibold text-prism-nav underline"
            onClick={() => void looks.refetch()}
          >
            Retry
          </button>
        </p>
      ) : count === 0 ? (
        <p className="text-prism-meta text-prism-ink-2">
          Save your page's look to keep it here. You can keep 10.
        </p>
      ) : (
        <ul
          className={cn(
            mobile
              ? "-mx-4 flex snap-x gap-[13px] overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
              : "grid grid-cols-3 gap-[13px]"
          )}
        >
          {looks.data!.looks.map(look => (
            <li key={look.id} className={cn(mobile && "w-[110px] shrink-0 snap-start")}>
              <LookTile
                look={look}
                applied={look.id === looks.data!.appliedId}
                busy={applying === look.id}
                onApply={() => void apply(look)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LookTile({
  look,
  applied,
  busy,
  onApply,
}: {
  look: Look;
  applied: boolean;
  busy: boolean;
  onApply: () => void;
}) {
  const { profile, setPreviewOverride } = useEditor();
  const refresh = useRefreshLooks();
  const [renameOpen, setRenameOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState(look.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = look.name || "My look";

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(false), DELETE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const run = async (action: () => Promise<unknown>, done: string, failed: string) => {
    try {
      await action();
      await refresh();
      toast.add({ type: "success", title: done });
    } catch (error) {
      toast.add({ type: "error", title: isLimit(error) ? LIMIT_REASON : failed });
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={applied}
        aria-label={`${label}${applied ? ", applied" : ""}`}
        disabled={busy}
        aria-busy={busy}
        onClick={onApply}
        onPointerEnter={() =>
          !applied &&
          look.config &&
          setPreviewOverride({
            config: look.config,
            label: `Previewing ${label}. Not applied yet.`,
          })
        }
        onPointerLeave={() => setPreviewOverride(null)}
        className={cn(
          "prism-focus block w-full rounded-prism-13 text-left",
          applied && "ring-2 ring-prism-nav ring-offset-2"
        )}
      >
        <LookArt config={look.config} />
        <span className="mt-1 block truncate text-prism-meta font-semibold text-prism-ink">
          {label}
        </span>
        <span className="block text-prism-meta text-prism-ink-2">
          {applied ? "Applied" : look.share_slug ? "Shared" : " "}
        </span>
      </button>
      <Menu>
        <MenuTrigger
          aria-label={`${label} options`}
          className="prism-icon-btn prism-focus absolute right-1 top-1 bg-white/85"
        >
          <MoreHorizontal aria-hidden className="h-[21px] w-[21px]" />
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            onSelect={() =>
              void run(
                () => trpcClient.theme.duplicate.mutate({ id: look.id }),
                `${label} duplicated`,
                "Could not duplicate. Try again."
              )
            }
          >
            <Copy aria-hidden />
            Duplicate
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setName(look.name ?? "");
              setRenameOpen(true);
            }}
          >
            <Pencil aria-hidden />
            Rename
          </MenuItem>
          <MenuItem onSelect={() => setShareOpen(true)}>
            <Link2 aria-hidden />
            Share
          </MenuItem>
          <MenuItem onSelect={() => setHistoryOpen(true)}>
            <History aria-hidden />
            History
          </MenuItem>
          <MenuItem onSelect={() => downloadLook(label, look.config, profile.handle || null)}>
            <Download aria-hidden />
            Export
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            disabled={applied}
            onSelect={event => {
              if (!confirmDelete) {
                event.preventDefault();
                setConfirmDelete(true);
                return;
              }
              void run(
                () => trpcClient.theme.deleteTheme.mutate({ id: look.id }),
                `${label} deleted`,
                "Could not delete. Try again."
              );
            }}
          >
            <Trash2 aria-hidden />
            {applied ? LOOKS_COPY.deleteApplied : confirmDelete ? "Confirm delete" : "Delete"}
          </MenuItem>
        </MenuContent>
      </Menu>

      <ShareLookDialog lookId={look.id} open={shareOpen} onOpenChange={setShareOpen} />
      {historyOpen && (
        <HistoryDialog look={look} applied={applied} onClose={() => setHistoryOpen(false)} />
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename look</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={event => {
              event.preventDefault();
              setRenameOpen(false);
              void run(
                () => trpcClient.theme.rename.mutate({ id: look.id, name }),
                "Look renamed",
                "Could not rename. Try again."
              );
            }}
          >
            <Input
              label="Name"
              value={name}
              maxLength={40}
              onChange={event => setName(event.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The last 20 versions of a look; hover previews, Restore applies (spec 3.9). */
function HistoryDialog({
  look,
  applied,
  onClose,
}: {
  look: Look;
  applied: boolean;
  onClose: () => void;
}) {
  const history = useQuery(trpc.theme.history.queryOptions({ id: look.id }));
  const { setPreviewOverride } = useEditor();
  const { refetch } = useThemeActions();
  const refresh = useRefreshLooks();
  const [restoring, setRestoring] = useState<number | null>(null);
  const label = look.name || "My look";

  const restore = async (versionId: number) => {
    setRestoring(versionId);
    try {
      await trpcClient.theme.restore.mutate({ id: look.id, versionId });
      setPreviewOverride(null);
      await Promise.all([refresh(), refetch()]);
      onClose();
      toast.add({ type: "success", title: `${label} restored and applied` });
    } catch {
      toast.add({ type: "error", title: "Could not restore. Try again." });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) {
          setPreviewOverride(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>History of {label}</DialogTitle>
          <DialogDescription>
            One version per editing session, the last 20. Restore applies the look as it was
            {applied ? "" : " and makes it your current look"}.
          </DialogDescription>
        </DialogHeader>
        {history.isPending ? (
          <Skeleton className="h-[144px] w-full" />
        ) : (history.data?.versions.length ?? 0) === 0 ? (
          <p className="text-prism-meta text-prism-ink-2">{LOOKS_COPY.historyEmpty}</p>
        ) : (
          <ul className="max-h-[377px] divide-y divide-prism-line overflow-y-auto">
            {history.data!.versions.map((version, index) => (
              <li
                key={version.id}
                className="flex min-h-touch items-center justify-between gap-3"
                onPointerEnter={() =>
                  setPreviewOverride({
                    config: version.config,
                    label: `Previewing ${label}, ${savedLine(version.createdAt).replace("Saved ", "saved ")}.`,
                  })
                }
              >
                <span className="text-prism-label text-prism-ink">
                  {savedLine(version.createdAt)}
                  {index === 0 && (
                    <span className="text-prism-meta text-prism-ink-2"> · latest</span>
                  )}
                </span>
                <Button
                  variant="secondary"
                  disabled={restoring !== null}
                  aria-busy={restoring === version.id}
                  onClick={() => void restore(version.id)}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Shared with me and Theme of the week                                     */
/* ------------------------------------------------------------------------ */

function useSharedActions() {
  const { refetch } = useThemeActions();
  const refresh = useRefreshLooks();
  const { setPreviewOverride } = useEditor();
  return async (slug: string, mode: "apply" | "save", name: string) => {
    try {
      const out = await trpcClient.theme.applyShared.mutate({ slug, mode });
      setPreviewOverride(null);
      await Promise.all([refresh(), mode === "apply" ? refetch() : Promise.resolve()]);
      toast.add({
        type: "success",
        title: mode === "apply" ? `${name} applied` : `${name} saved to My looks`,
        duration: 8000,
        actionProps:
          mode === "apply" && out.undoVersionId
            ? {
                children: "Undo",
                onClick: () =>
                  void trpcClient.theme.restore
                    .mutate({ id: out.themeId, versionId: out.undoVersionId! })
                    .then(() => refetch())
                    .catch(() => undefined),
              }
            : undefined,
      });
      return true;
    } catch (error) {
      toast.add({
        type: "error",
        title: isLimit(error)
          ? LIMIT_REASON
          : `${name} was not ${mode === "apply" ? "applied" : "saved"}.`,
      });
      return false;
    }
  };
}

export function SharedWithMe({ version }: { version: number }) {
  const [entries, setEntries] = useState<SharedEntry[]>(() => readShared());
  const { setPreviewOverride } = useEditor();
  const act = useSharedActions();
  // version bumps when ThemesTab records a link from ?look=
  useEffect(() => setEntries(readShared()), [version]);

  const preview = async (entry: SharedEntry) => {
    try {
      const look = await trpcClient.theme.bySlug.query({ slug: entry.slug });
      setPreviewOverride({
        config: look.config,
        label: `Previewing ${look.name}. Not applied yet.`,
      });
    } catch {
      // A stopped link: drop it from the list
      setEntries(forgetShared(entry.slug));
      toast.add({ type: "error", title: `${entry.name} is no longer shared.` });
    }
  };

  return (
    <section aria-labelledby="shared-with-me" className="mb-[34px] space-y-[13px]">
      <h3 id="shared-with-me" className="text-prism-eyebrow uppercase text-prism-ink-2">
        {LOOKS_COPY.shared}
      </h3>
      {entries.length === 0 ? (
        <p className="text-prism-meta text-prism-ink-2">{LOOKS_COPY.sharedEmpty}</p>
      ) : (
        <ul className="divide-y divide-prism-line">
          {entries.map(entry => (
            <li key={entry.slug} className="flex min-h-[55px] flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-prism-label font-semibold text-prism-ink">
                  {entry.name}
                </span>
                {entry.author && (
                  <span className="block text-prism-meta text-prism-ink-2">
                    Made by @{entry.author}
                  </span>
                )}
              </span>
              <Button variant="ghost" onClick={() => void preview(entry)}>
                Preview
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (await act(entry.slug, "save", entry.name))
                    setEntries(forgetShared(entry.slug));
                }}
              >
                Save
              </Button>
              <Button
                onClick={async () => {
                  if (await act(entry.slug, "apply", entry.name))
                    setEntries(forgetShared(entry.slug));
                }}
              >
                Use
              </Button>
              <button
                type="button"
                aria-label={`Remove ${entry.name}`}
                className="prism-icon-btn prism-focus"
                onClick={() => setEntries(forgetShared(entry.slug))}
              >
                <Trash2 aria-hidden className="h-5 w-5 text-prism-ink-2" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ThemeOfTheWeek() {
  const week = useQuery(trpc.theme.themeOfTheWeek.queryOptions());
  const { setPreviewOverride } = useEditor();
  const act = useSharedActions();
  const look = week.data;
  if (!look) return null;
  return (
    <section
      aria-labelledby="theme-of-the-week"
      className="prism-glass-clear mb-[34px] flex items-center gap-[13px] p-[13px]"
    >
      <span className="w-[89px] shrink-0">
        <LookArt config={look.config} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 id="theme-of-the-week" className="text-prism-eyebrow uppercase text-prism-ink-2">
          {LOOKS_COPY.week}
        </h3>
        <p className="truncate text-prism-label font-bold text-prism-ink">{look.name}</p>
        {look.author && <p className="text-prism-meta text-prism-ink-2">Made by @{look.author}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              setPreviewOverride({
                config: look.config,
                label: `Previewing ${look.name}. Not applied yet.`,
              })
            }
          >
            Preview
          </Button>
          <Button variant="secondary" onClick={() => void act(look.slug, "save", look.name)}>
            Save
          </Button>
          <Button onClick={() => void act(look.slug, "apply", look.name)}>Use</Button>
        </div>
      </div>
    </section>
  );
}
