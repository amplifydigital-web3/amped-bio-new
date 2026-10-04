import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { BellOff, ChevronLeft, Flag, Inbox } from "lucide-react";
import { BROADCAST_REPORT_REASONS, type BroadcastReportReasonValue } from "@repo/constants";
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorCard,
  cn,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { useEditor } from "@/contexts/EditorContext";
import { Avatar, BroadcastBody, BroadcastFooter } from "./shared";
import { longTime, shortTime } from "./utils";

function invalidateInbox(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: trpc.broadcast.inbox.pathKey() });
}

function ReportDialog({
  broadcastId,
  open,
  onOpenChange,
}: {
  broadcastId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<BroadcastReportReasonValue | null>(null);
  const [note, setNote] = useState("");
  const report = useMutation({
    mutationFn: () =>
      trpcClient.broadcast.inbox.report.mutate({
        broadcastId,
        reason: reason!,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      onOpenChange(false);
      invalidateInbox(queryClient);
      toast.add({ type: "success", title: "Thanks. Amped will review this message." });
    },
    onError: () => toast.add({ type: "error", title: "Your report was not sent. Try again." }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this message</DialogTitle>
          <DialogDescription>
            Amped reviews every report. The creator does not see who reported.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1">
          <legend className="sr-only">Reason</legend>
          {BROADCAST_REPORT_REASONS.map(r => (
            <label
              key={r.value}
              className="flex min-h-touch cursor-pointer items-center gap-3 font-prism text-prism-label text-prism-ink"
            >
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-5 w-5 accent-prism-nav"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-2">
          <span className="block text-prism-label font-semibold text-prism-ink">
            Anything else (optional)
          </span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="prism-well prism-focus block w-full rounded-prism-13 px-4 py-3 font-prism text-prism-body text-prism-ink"
          />
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => report.mutate()} disabled={!reason || report.isPending}>
            {report.isPending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageView({ broadcastId, onBack }: { broadcastId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery(
    trpc.broadcast.inbox.get.queryOptions({ broadcastId })
  );
  // Opening marks it read on the server; refresh the list and the badge once it lands
  const loadedId = data?.broadcastId;
  useEffect(() => {
    if (!loadedId) return;
    void queryClient.invalidateQueries({ queryKey: trpc.broadcast.inbox.list.pathKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.broadcast.inbox.unreadCount.pathKey() });
  }, [loadedId, queryClient]);

  const mute = useMutation({
    mutationFn: async (muted: boolean) => {
      if (muted)
        await trpcClient.broadcast.inbox.unmute.mutate({ creatorUserId: data!.creator.id });
      else
        await trpcClient.broadcast.inbox.mute.mutate({ creatorUserId: data!.creator.id, days: 30 });
    },
    onSuccess: (_, muted) => {
      invalidateInbox(queryClient);
      toast.add({
        type: "success",
        title: muted ? `${data!.creator.name} unmuted` : `${data!.creator.name} muted for 30 days`,
      });
    },
  });
  const skeleton = useDelayed(isLoading, 400);

  if (isLoading)
    return skeleton ? <div aria-hidden className="h-96 rounded-prism-21 bg-prism-line/60" /> : null;
  if (isError || !data) {
    return (
      <ErrorCard
        title="This message did not load"
        cause="It may have been removed."
        onRetry={() => void refetch()}
      />
    );
  }

  const muted = !!data.mutedUntil;
  return (
    <article aria-labelledby="inbox-message-title" className="min-w-0 space-y-4">
      <Button variant="ghost" onClick={onBack} className="lg:hidden">
        <ChevronLeft aria-hidden />
        Inbox
      </Button>
      <div className="prism-slab space-y-4 rounded-prism-21 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={data.creator.name} src={data.creator.avatar} size={55} />
          <div className="min-w-0">
            <span className="block truncate text-prism-label font-semibold text-prism-ink">
              {data.creator.name}
            </span>
            <span className="block truncate text-prism-meta text-prism-ink-2">
              {data.poolName ? `${data.poolName}, ` : ""}
              {longTime(data.deliveredAt)}
            </span>
          </div>
        </div>
        <h2
          id="inbox-message-title"
          className="text-prism-card-title text-prism-ink [text-wrap:balance]"
        >
          {data.title}
        </h2>
        <BroadcastBody body={data.body} />
        <BroadcastFooter creatorName={data.creator.name} />
      </div>

      <section
        aria-labelledby="inbox-updates-from"
        className="prism-slab space-y-2 rounded-prism-21 p-5"
      >
        <h3 id="inbox-updates-from" className="text-prism-eyebrow uppercase text-prism-ink-2">
          Updates from {data.creator.name}
        </h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <BellOff
              aria-hidden
              className="mt-0.5 h-5 w-5 shrink-0 text-prism-ink-2"
              strokeWidth={1.5}
            />
            <div className="min-w-0">
              <span className="block text-prism-label font-semibold text-prism-ink">
                {muted
                  ? `Muted until ${new Date(data.mutedUntil!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : "Mute for 30 days"}
              </span>
              <span className="block text-prism-meta text-prism-ink-2">
                Messages still arrive, without a badge.
              </span>
            </div>
          </div>
          <Button variant="secondary" onClick={() => mute.mutate(muted)} disabled={mute.isPending}>
            {muted ? "Unmute" : "Mute"}
          </Button>
        </div>
      </section>

      <div className="flex justify-center">
        {data.reported ? (
          <p className="text-prism-meta text-prism-ink-2">You reported this message.</p>
        ) : (
          <Button variant="ghost" onClick={() => setReportOpen(true)}>
            <Flag aria-hidden />
            Report this message
          </Button>
        )}
      </div>
      <ReportDialog broadcastId={broadcastId} open={reportOpen} onOpenChange={setReportOpen} />
    </article>
  );
}

/**
 * Inbox (boards br3 and br4). Every member gets each broadcast here. Phase 1
 * has no email. Deep link: /inbox?b={broadcastId}.
 */
export function InboxPanel() {
  const { setActivePanelAndNavigate } = useEditor();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get("b")) || null;
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [creatorId, setCreatorId] = useState<number | undefined>(undefined);

  const setOpen = (id: number | null) =>
    setParams(
      current => {
        const next = new URLSearchParams(current);
        if (id === null) next.delete("b");
        else next.set("b", String(id));
        return next;
      },
      { replace: false }
    );

  const unread = useQuery(trpc.broadcast.inbox.unreadCount.queryOptions());
  const creators = useQuery(trpc.broadcast.inbox.creators.queryOptions());
  const list = useInfiniteQuery(
    trpc.broadcast.inbox.list.infiniteQueryOptions(
      { filter, creatorUserId: creatorId },
      { getNextPageParam: last => last.nextCursor ?? undefined }
    )
  );
  const items = list.data?.pages.flatMap(p => p.items) ?? [];
  const skeleton = useDelayed(list.isLoading, 400);

  const chips = (
    <div
      role="group"
      aria-label="Filter messages"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1"
    >
      <Chip
        selected={filter === "all" && !creatorId}
        onClick={() => {
          setFilter("all");
          setCreatorId(undefined);
        }}
      >
        All
      </Chip>
      <Chip
        selected={filter === "unread"}
        onClick={() => {
          setFilter("unread");
          setCreatorId(undefined);
        }}
      >
        Unread{unread.data?.count ? ` ${unread.data.count}` : ""}
      </Chip>
      {(creators.data ?? []).map(c => (
        <Chip
          key={c.id}
          selected={creatorId === c.id}
          onClick={() => {
            setFilter("all");
            setCreatorId(c.id);
          }}
        >
          {c.name}
        </Chip>
      ))}
    </div>
  );

  let listBody: React.ReactNode;
  if (list.isLoading) {
    listBody = skeleton ? (
      <div aria-hidden className="h-80 rounded-prism-21 bg-prism-line/60" />
    ) : null;
  } else if (list.isError) {
    listBody = (
      <ErrorCard
        title="Your inbox did not load"
        cause="Try again in a moment."
        onRetry={() => void list.refetch()}
      />
    );
  } else if (items.length === 0) {
    listBody =
      filter === "unread" || creatorId ? (
        <EmptyState
          icon={Inbox}
          title="Nothing here"
          description="No messages match this filter."
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="No messages yet"
          description="When you join a creator's pool, their updates arrive here."
          action={
            <Button variant="secondary" onClick={() => setActivePanelAndNavigate("explore")}>
              Explore pools
            </Button>
          }
        />
      );
  } else {
    listBody = (
      <ul
        aria-label="Messages"
        className="prism-slab divide-y divide-prism-line overflow-hidden rounded-prism-21"
      >
        {items.map(m => (
          <li key={m.deliveryId}>
            <button
              type="button"
              onClick={() => setOpen(m.broadcastId)}
              aria-current={openId === m.broadcastId ? "true" : undefined}
              className={cn(
                "prism-focus flex w-full items-start gap-3 px-4 py-4 text-left",
                openId === m.broadcastId ? "bg-prism-nav-tint" : "hover:bg-white/50"
              )}
            >
              <Avatar name={m.creator.name} src={m.creator.avatar} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-prism-label font-semibold text-prism-ink">
                    {m.creator.name}
                  </span>
                  <span className="shrink-0 text-prism-meta text-prism-ink-2">
                    {shortTime(m.deliveredAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    "block truncate text-prism-label text-prism-ink",
                    m.unread && "font-bold"
                  )}
                >
                  {m.title}
                </span>
                <span className="block truncate text-prism-meta text-prism-ink-2">{m.preview}</span>
              </span>
              {m.unread && (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-prism-nav">
                  <span className="sr-only">Unread</span>
                </span>
              )}
            </button>
          </li>
        ))}
        {list.hasNextPage && (
          <li className="flex justify-center p-3">
            <Button
              variant="secondary"
              onClick={() => void list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? "Loading…" : "Show older"}
            </Button>
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className={cn("min-w-0 space-y-4", openId && "hidden lg:block")}>
          {chips}
          {listBody}
        </div>
        <div className={cn("min-w-0", !openId && "hidden lg:block")}>
          {openId ? (
            <MessageView broadcastId={openId} onBack={() => setOpen(null)} />
          ) : (
            items.length > 0 && (
              <div className="prism-slab flex h-full min-h-60 items-center justify-center rounded-prism-21 p-5 text-prism-label text-prism-ink-2">
                Choose a message to read it.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
