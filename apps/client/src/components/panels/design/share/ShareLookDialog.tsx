import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  trpc,
  trpcClient,
} from "@repo/ui";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  CONFIRM_STOP_MS,
  COPIED_MS,
  SHARE_COPY,
  shareUrl,
  shareUsesLine,
  type ShareState,
} from "./shareLook";

/**
 * Theme Engine v2 TE-4b, Share this look (spec 3.10, board 12; 12m on a
 * phone, states on 13). First share: the two switches and Create link; no
 * link exists until then. Shared: the link with Copy link, the switches
 * (each change saves at once), the usage line, Stop sharing (confirmed in
 * place) and Done.
 */
export function ShareLookDialog({
  lookId,
  open,
  onOpenChange,
}: {
  lookId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const body = <ShareLookBody lookId={lookId} onDone={() => onOpenChange(false)} />;
  if (phone) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange}>
        <BottomSheetContent title={SHARE_COPY.title}>{open && body}</BottomSheetContent>
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{SHARE_COPY.title}</DialogTitle>
        </DialogHeader>
        {open && body}
      </DialogContent>
    </Dialog>
  );
}

function ShareLookBody({ lookId, onDone }: { lookId: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const looks = useQuery(trpc.theme.looks.queryOptions());
  const stored = looks.data?.looks.find(l => l.id === lookId);
  const [draft, setDraft] = useState({ credit: true, download: false });
  const [state, setState] = useState<ShareState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [status, setStatus] = useState("");

  // The stored link, until this dialog changes it
  const current: ShareState | null =
    state ??
    (stored
      ? {
          slug: stored.share_slug,
          credit: stored.share_credit,
          download: stored.share_download,
          uses: stored.share_uses,
        }
      : null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!confirmStop) return;
    const timer = setTimeout(() => setConfirmStop(false), CONFIRM_STOP_MS);
    return () => clearTimeout(timer);
  }, [confirmStop]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.theme.looks.queryKey() });

  const save = async (change: { credit?: boolean; download?: boolean }) => {
    setBusy(true);
    setStatus("");
    try {
      const next = await trpcClient.theme.share.mutate({ id: lookId, ...change });
      setState(next);
      void refresh();
    } catch {
      setStatus(SHARE_COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!confirmStop) {
      setConfirmStop(true);
      return;
    }
    setBusy(true);
    try {
      const next = await trpcClient.theme.unshare.mutate({ id: lookId });
      setState(next);
      setConfirmStop(false);
      setStatus(SHARE_COPY.stopped);
      void refresh();
    } catch {
      setStatus(SHARE_COPY.failed);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus(SHARE_COPY.copiedStatus);
    } catch {
      setStatus(SHARE_COPY.failed);
    }
  };

  if (looks.isPending) {
    return <p className="py-5 text-prism-meta text-prism-ink-2">Loading</p>;
  }

  const shared = Boolean(current?.slug);
  const credit = shared ? current!.credit : draft.credit;
  const download = shared ? current!.download : draft.download;
  const url = current?.slug ? shareUrl(current.slug) : "";

  return (
    <div className="space-y-[21px]">
      <p className="text-prism-meta text-prism-ink-2">{SHARE_COPY.intro}</p>

      {shared && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              label="Link"
              readOnly
              value={url}
              onFocus={event => event.currentTarget.select()}
            />
          </div>
          <Button variant="secondary" onClick={() => void copy(url)} className="shrink-0">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? SHARE_COPY.copied : SHARE_COPY.copy}
          </Button>
        </div>
      )}

      <div className="divide-y divide-prism-line">
        <div className="flex min-h-[55px] items-center">
          <Switch
            className="w-full"
            label={SHARE_COPY.credit}
            description={SHARE_COPY.creditHelp}
            checked={credit}
            disabled={busy}
            onChange={value =>
              shared ? void save({ credit: value }) : setDraft(d => ({ ...d, credit: value }))
            }
          />
        </div>
        <div className="flex min-h-[55px] items-center">
          <Switch
            className="w-full"
            label={SHARE_COPY.download}
            description={SHARE_COPY.downloadHelp}
            checked={download}
            disabled={busy}
            onChange={value =>
              shared ? void save({ download: value }) : setDraft(d => ({ ...d, download: value }))
            }
          />
        </div>
      </div>

      {shared && <p className="text-prism-meta text-prism-ink-2">{shareUsesLine(current!.uses)}</p>}

      <p role="status" className="min-h-[21px] text-prism-meta text-prism-ink">
        {status}
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {shared ? (
          <>
            <Button
              variant={confirmStop ? "destructive" : "secondary"}
              disabled={busy}
              onClick={() => void stop()}
            >
              {confirmStop ? SHARE_COPY.confirmStop : SHARE_COPY.stop}
            </Button>
            <Button onClick={onDone}>{SHARE_COPY.done}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onDone}>
              {SHARE_COPY.cancel}
            </Button>
            <Button disabled={busy} aria-busy={busy} onClick={() => void save(draft)}>
              {SHARE_COPY.create}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
