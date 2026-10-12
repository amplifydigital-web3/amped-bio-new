import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Ban, ChevronLeft, Flag, MoreHorizontal, Send } from "lucide-react";
import {
  BROADCAST_REPORT_REASONS,
  TELEGRAM_APP_STRINGS as S,
  TELEGRAM_LIMITS,
  type BroadcastReportReasonValue,
} from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  cn,
  trpc,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { Avatar } from "../broadcast/shared";
import { longTime } from "../broadcast/utils";
import { errorMessage, newIdempotencyKey } from "./shared";

export type ThreadSide = "creator" | "fan";
type CreatorThread = RouterOutputs["messaging"]["creator"]["getThread"];
type FanThread = RouterOutputs["messaging"]["fan"]["getThread"];
type ThreadMessage = CreatorThread["messages"][number] & { failedReason?: string | null };

/** Refresh the lists and the inbox badge after anything that changes a thread. */
function invalidateMessaging(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: trpc.messaging.pathKey() });
}

function ReportDialog({
  open,
  onOpenChange,
  onSend,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (reason: BroadcastReportReasonValue, note?: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState<BroadcastReportReasonValue | null>(null);
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{S.reportTitle}</DialogTitle>
          <DialogDescription>{S.reportBody}</DialogDescription>
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
                name="thread-report-reason"
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
          <Button
            onClick={() => reason && onSend(reason, note.trim() || undefined)}
            disabled={!reason || pending}
          >
            {pending ? "Sending…" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bubble({ message, mine }: { message: ThreadMessage; mine: boolean }) {
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-1", mine && "text-right")}>
        <p
          className={cn(
            "whitespace-pre-wrap break-words rounded-prism-13 px-[13px] py-2 text-left text-prism-body",
            mine ? "bg-prism-nav text-white" : "prism-well text-prism-ink"
          )}
        >
          {message.body}
        </p>
        <p className="text-prism-meta text-prism-ink-2">
          {longTime(message.createdAt)}
          {message.channel === "TELEGRAM" && `, ${S.sentFromTelegram}`}
        </p>
        {mine && message.failedReason === "not_reachable" && (
          <p className="text-prism-meta text-prism-ink-2">{S.notReachable}</p>
        )}
      </div>
    </li>
  );
}

function Composer({
  label,
  placeholder,
  onSend,
}: {
  label: string;
  placeholder: string;
  onSend: (body: string, key: string) => Promise<unknown>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // The same key for a retried text, a new one after a send lands
  const key = useRef(newIdempotencyKey());
  const max = TELEGRAM_LIMITS.messageBodyMax;
  const trimmed = body.trim();

  const send = async () => {
    if (!trimmed || trimmed.length > max || sending) return;
    setSending(true);
    try {
      await onSend(trimmed, key.current);
      setBody("");
      key.current = newIdempotencyKey();
    } catch (error) {
      toast.add({ type: "error", title: errorMessage(error, S.sendFailed) });
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void send();
      }}
      className="space-y-2"
    >
      <label htmlFor="thread-reply" className="sr-only">
        {label}
      </label>
      <textarea
        id="thread-reply"
        value={body}
        onChange={event => {
          setBody(event.target.value);
          key.current = newIdempotencyKey();
        }}
        onKeyDown={event => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
        rows={3}
        maxLength={max}
        placeholder={placeholder}
        className="prism-well prism-focus block w-full resize-y rounded-prism-13 px-4 py-3 font-prism text-prism-body text-prism-ink"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-prism-meta tabular-nums text-prism-ink-2">
          {body.length} / {max.toLocaleString("en-US")}
        </span>
        <Button type="submit" disabled={!trimmed || sending} aria-busy={sending}>
          <Send aria-hidden />
          {sending ? S.sending : S.send}
        </Button>
      </div>
    </form>
  );
}

/**
 * One conversation (Screen Review 113, board tg2), from either side. The creator
 * sees the fan's handle and relation badge, the Telegram username only when the
 * fan shares it, and Mute, Block and Report in the overflow. The fan sees the
 * creator's name, never a Telegram username. Opening the thread marks it read.
 */
export function ThreadView({
  threadId,
  side,
  onBack,
  onWrongSide,
}: {
  threadId: string;
  side: ThreadSide;
  onBack: () => void;
  /** The thread is not this user's on `side` (a deep link without a side) */
  onWrongSide?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [older, setOlder] = useState<{ messages: ThreadMessage[]; cursor: string | null } | null>(
    null
  );

  const creatorQuery = useQuery({
    ...trpc.messaging.creator.getThread.queryOptions({ threadId }),
    enabled: side === "creator",
    retry: false,
  });
  const fanQuery = useQuery({
    ...trpc.messaging.fan.getThread.queryOptions({ threadId }),
    enabled: side === "fan",
    retry: false,
  });
  const query = side === "creator" ? creatorQuery : fanQuery;
  const data = query.data as CreatorThread | FanThread | undefined;
  const skeleton = useDelayed(query.isLoading, 400);

  useEffect(() => setOlder(null), [threadId, side]);
  // The server marks it read on open; refresh the lists and the badge
  const loadedId = data?.id;
  useEffect(() => {
    if (loadedId) invalidateMessaging(queryClient);
  }, [loadedId, queryClient]);
  const notFound = (query.error as { data?: { code?: string } } | null)?.data?.code === "NOT_FOUND";
  useEffect(() => {
    if (notFound) onWrongSide?.();
  }, [notFound, onWrongSide]);

  const refresh = () => {
    void query.refetch();
    invalidateMessaging(queryClient);
  };

  const act = useMutation({
    mutationFn: async (action: "block" | "unblock" | "mute7" | "mute30" | "unmute") => {
      const api = side === "creator" ? trpcClient.messaging.creator : trpcClient.messaging.fan;
      if (action === "block") return api.block.mutate({ threadId });
      if (action === "unblock") return api.unblock.mutate({ threadId });
      const days = action === "mute7" ? 7 : action === "mute30" ? 30 : 0;
      return trpcClient.messaging.creator.mute.mutate({ threadId, days });
    },
    onSuccess: () => {
      setBlockOpen(false);
      refresh();
    },
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.actionFailed) }),
  });

  const report = useMutation({
    mutationFn: ({ reason, note }: { reason: BroadcastReportReasonValue; note?: string }) =>
      (side === "creator"
        ? trpcClient.messaging.creator.report
        : trpcClient.messaging.fan.report
      ).mutate({ threadId, reason, note }),
    onSuccess: () => {
      setReportOpen(false);
      toast.add({ type: "success", title: S.reportSent });
    },
    onError: error => toast.add({ type: "error", title: errorMessage(error, S.reportFailed) }),
  });

  const loadOlder = useMutation({
    mutationFn: async () => {
      const before = older?.cursor ?? data?.olderCursor;
      if (!before) return null;
      return side === "creator"
        ? trpcClient.messaging.creator.getThread.query({ threadId, before })
        : trpcClient.messaging.fan.getThread.query({ threadId, before });
    },
    onSuccess: page => {
      if (!page) return;
      setOlder(current => ({
        messages: [...(page.messages as ThreadMessage[]), ...(current?.messages ?? [])],
        cursor: page.olderCursor,
      }));
    },
  });

  if (query.isLoading)
    return skeleton ? <div aria-hidden className="h-96 rounded-prism-21 bg-prism-line/60" /> : null;
  if (query.isError || !data) {
    if (notFound && onWrongSide) return null;
    return (
      <ErrorCard
        title={S.threadLoadError}
        cause={errorMessage(query.error, "Try again in a moment.")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const creatorView = side === "creator" ? (data as CreatorThread) : null;
  const fanView = side === "fan" ? (data as FanThread) : null;
  const person = creatorView
    ? {
        name: creatorView.fan?.name ?? "Fan",
        avatar: creatorView.fan?.avatarUrl ?? null,
        line: [
          creatorView.fan?.handle ? `@${creatorView.fan.handle}` : null,
          creatorView.fan?.telegramUsername
            ? `@${creatorView.fan.telegramUsername} on Telegram`
            : null,
        ]
          .filter(Boolean)
          .join(", "),
        badge: creatorView.fan?.relationLabel ?? null,
      }
    : {
        name: fanView?.creator?.name ?? "Creator",
        avatar: fanView?.creator?.avatarUrl ?? null,
        line: fanView?.creator?.handle ? `@${fanView.creator.handle}` : "",
        badge: null,
      };
  const mineSender = side === "creator" ? "CREATOR" : "FAN";
  const messages = [...(older?.messages ?? []), ...(data.messages as ThreadMessage[])];
  const hasOlder = older ? !!older.cursor : !!data.olderCursor;

  // Who closed the conversation decides what this side can do
  const blockedByMe =
    (side === "creator" && data.status === "BLOCKED_BY_CREATOR") ||
    (side === "fan" && data.status === "BLOCKED_BY_FAN");
  let closedLine: string | null = null;
  if (data.status !== "OPEN") {
    if (blockedByMe)
      closedLine = side === "creator" ? S.threadClosedCreator : S.threadClosedFanSelf;
    else if (side === "creator") closedLine = S.threadClosedByFan;
    else closedLine = S.threadClosedFan(person.name);
  }
  // A fan who blocked the creator writes again to reopen it (PR 3 decision)
  const canWrite = data.status === "OPEN" || (side === "fan" && blockedByMe);

  const send = async (body: string, idempotencyKey: string) => {
    if (side === "creator") {
      await trpcClient.messaging.creator.reply.mutate({ threadId, body, idempotencyKey });
    } else {
      await trpcClient.messaging.fan.send.mutate({
        creatorUserId: fanView!.creator!.userId,
        body,
        idempotencyKey,
      });
    }
    refresh();
  };

  return (
    <article aria-labelledby="thread-title" className="min-w-0 space-y-4">
      <Button variant="ghost" onClick={onBack} className="lg:hidden">
        <ChevronLeft aria-hidden />
        {S.backToMessages}
      </Button>
      <div className="prism-slab space-y-4 rounded-prism-21 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={person.name} src={person.avatar} size={55} />
          <div className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span
                id="thread-title"
                className="truncate text-prism-label font-semibold text-prism-ink"
              >
                {person.name}
              </span>
              {person.badge && (
                <span className="rounded-full bg-prism-nav-tint px-2 py-0.5 text-prism-meta font-semibold text-prism-nav">
                  {person.badge}
                </span>
              )}
            </span>
            {person.line && (
              <span className="block truncate text-prism-meta text-prism-ink-2">{person.line}</span>
            )}
          </div>
          <Menu>
            <MenuTrigger aria-label={S.moreActions} className="prism-icon-btn prism-focus shrink-0">
              <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            </MenuTrigger>
            <MenuContent align="end">
              {creatorView &&
                (creatorView.muted ? (
                  <MenuItem onSelect={() => act.mutate("unmute")}>
                    <BellOff aria-hidden />
                    {S.unmute}
                  </MenuItem>
                ) : (
                  <>
                    <MenuItem onSelect={() => act.mutate("mute7")}>
                      <BellOff aria-hidden />
                      {S.mute7}
                    </MenuItem>
                    <MenuItem onSelect={() => act.mutate("mute30")}>
                      <BellOff aria-hidden />
                      {S.mute30}
                    </MenuItem>
                  </>
                ))}
              {blockedByMe ? (
                <MenuItem onSelect={() => act.mutate("unblock")}>
                  <Ban aria-hidden />
                  {S.unblock}
                </MenuItem>
              ) : (
                <MenuItem onSelect={() => setBlockOpen(true)}>
                  <Ban aria-hidden />
                  {S.block}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem onSelect={() => setReportOpen(true)}>
                <Flag aria-hidden />
                {S.report}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        {creatorView?.muted && <p className="text-prism-meta text-prism-ink-2">{S.mutedLine}</p>}

        {hasOlder && (
          <div className="flex justify-center">
            <Button
              variant="secondary"
              onClick={() => loadOlder.mutate()}
              disabled={loadOlder.isPending}
            >
              {loadOlder.isPending ? "Loading…" : S.showOlder}
            </Button>
          </div>
        )}
        <ol aria-label="Messages" className="space-y-3">
          {messages.map(message => (
            <Bubble key={message.id} message={message} mine={message.sender === mineSender} />
          ))}
        </ol>

        {closedLine && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-prism-line pt-3">
            <p className="text-prism-meta text-prism-ink-2">{closedLine}</p>
            {blockedByMe && side === "creator" && (
              <Button
                variant="secondary"
                onClick={() => act.mutate("unblock")}
                disabled={act.isPending}
              >
                {S.unblock}
              </Button>
            )}
          </div>
        )}
        {canWrite && (
          <Composer
            label={S.replyLabel}
            placeholder={side === "creator" ? S.replyPlaceholder : S.writePlaceholder}
            onSend={send}
          />
        )}
      </div>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {side === "creator"
                ? S.blockConfirmTitle(person.name)
                : S.blockFanConfirmTitle(person.name)}
            </DialogTitle>
            <DialogDescription>
              {side === "creator" ? S.blockConfirmBody : S.blockFanConfirmBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBlockOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => act.mutate("block")} disabled={act.isPending}>
              {S.block}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        pending={report.isPending}
        onSend={(reason, note) => report.mutate({ reason, note })}
      />
    </article>
  );
}
