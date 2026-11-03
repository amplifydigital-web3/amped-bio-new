import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  EyeOff,
  Megaphone,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  EMAIL_VERIFICATION_GRACE_BROADCASTS,
  EMAIL_VERIFICATION_GRACE_DAYS,
} from "@repo/constants";
import {
  Button,
  EmptyState,
  ErrorCard,
  Notice,
  cn,
  trpc,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { toast } from "@/components/ui/toast";
import { Composer } from "./Composer";
import { BroadcastBody, BroadcastFooter } from "./shared";
import { longTime, shortTime } from "./utils";

type SentItem = RouterOutputs["broadcast"]["creator"]["list"][number];

/** Status chip on the sent list (board br2). Removed is a sent broadcast Amped took down. */
function statusOf(b: Pick<SentItem, "status" | "completedAt">) {
  switch (b.status) {
    case "SENT":
      return {
        label: "Sent",
        icon: CheckCircle2,
        cls: "bg-white/70 text-prism-success shadow-[inset_0_0_0_1px_rgba(23,105,63,0.24)]",
      };
    case "SENDING":
    case "QUEUED":
      return { label: "Sending", icon: Clock, cls: "bg-prism-nav-tint text-prism-nav" };
    case "IN_REVIEW":
      return {
        label: "In review",
        icon: AlertTriangle,
        cls: "bg-prism-warning-bg text-prism-warning-ink",
      };
    case "REJECTED":
      return b.completedAt
        ? { label: "Removed", icon: XCircle, cls: "bg-prism-warning-bg text-prism-danger" }
        : { label: "Not approved", icon: XCircle, cls: "bg-prism-warning-bg text-prism-danger" };
    case "CANCELED":
      return { label: "Withdrawn", icon: Undo2, cls: "bg-prism-line text-prism-ink-2" };
    default:
      return { label: "Not sent", icon: XCircle, cls: "bg-prism-warning-bg text-prism-danger" };
  }
}

function StatusChip({ b }: { b: Pick<SentItem, "status" | "completedAt"> }) {
  const s = statusOf(b);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-prism-8 px-2 py-1 text-prism-meta font-semibold",
        s.cls
      )}
    >
      <s.icon aria-hidden className="h-4 w-4" strokeWidth={2} />
      {s.label}
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="prism-row rounded-prism-13 px-4 py-3">
      <span className="block text-prism-meta text-prism-ink-2">{label}</span>
      <span className="block font-prism-display text-prism-display-42 tabular-nums text-prism-ink">
        {value}
      </span>
      {sub && <span className="mt-1 block text-prism-meta text-prism-ink-2">{sub}</span>}
    </div>
  );
}

function Detail({ id, creatorName }: { id: number; creatorName: string }) {
  const queryClient = useQueryClient();
  const [showMessage, setShowMessage] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.broadcast.creator.getStats.queryOptions({ id }),
    refetchInterval: q =>
      q.state.data && ["QUEUED", "SENDING"].includes(q.state.data.status) ? 3000 : false,
  });
  const withdraw = useMutation({
    mutationFn: () => trpcClient.broadcast.creator.cancel.mutate({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.broadcast.creator.pathKey() });
      toast.add({ type: "success", title: "Broadcast withdrawn" });
    },
    onError: () => toast.add({ type: "error", title: "It was not withdrawn. Try again." }),
  });
  const skeleton = useDelayed(isLoading, 400);

  if (isLoading)
    return skeleton ? <div aria-hidden className="h-80 rounded-prism-21 bg-prism-line/60" /> : null;
  if (isError || !data) {
    return (
      <ErrorCard
        title="This broadcast did not load"
        cause="Try again in a moment."
        onRetry={() => void refetch()}
      />
    );
  }

  const recipients =
    data.status === "SENT" || data.status === "SENDING"
      ? data.recipientCount
      : data.recipientEstimate;
  const readShare =
    data.recipientCount > 0 ? Math.round((data.read / data.recipientCount) * 100) : 0;

  return (
    <section
      aria-labelledby="broadcast-detail-title"
      className="prism-slab min-w-0 space-y-5 rounded-prism-21 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <span className="block text-prism-eyebrow uppercase text-prism-ink-2">
            To all members
          </span>
          <h2
            id="broadcast-detail-title"
            className="text-prism-card-title text-prism-ink [text-wrap:balance]"
          >
            {data.title}
          </h2>
          <p className="text-prism-meta text-prism-ink-2">
            {longTime(data.completedAt ?? data.createdAt)}. Amped inbox.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setShowMessage(s => !s)}
          aria-expanded={showMessage}
        >
          {showMessage ? "Hide message" : "View message"}
        </Button>
      </div>

      {data.status === "IN_REVIEW" && (
        <Notice variant="warning" title="Waiting for review">
          Amped reviews each creator&rsquo;s first broadcast before it reaches members. You can
          withdraw it until then.
          <span className="mt-3 block">
            <Button
              variant="secondary"
              onClick={() => withdraw.mutate()}
              disabled={withdraw.isPending}
            >
              Withdraw
            </Button>
          </span>
        </Notice>
      )}
      {data.status === "REJECTED" && (
        <Notice
          variant="error"
          title={
            data.completedAt ? "Amped removed this broadcast" : "This broadcast was not approved"
          }
        >
          {data.reviewNote ?? "It broke the broadcast policy."}
        </Notice>
      )}
      {(data.status === "QUEUED" || data.status === "SENDING") && (
        <Notice variant="info" role="status">
          Delivering to members&rsquo; inboxes.
        </Notice>
      )}

      {showMessage && (
        <div className="prism-row space-y-4 rounded-prism-13 p-4">
          <BroadcastBody body={data.body} />
          <BroadcastFooter creatorName={creatorName} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Tile label="Recipients" value={recipients.toLocaleString()} />
        <Tile
          label="Read in the inbox"
          value={data.read.toLocaleString()}
          sub={data.recipientCount > 0 ? `${readShare}% of recipients` : undefined}
        />
        <Tile label="Reports" value={data.reports.toLocaleString()} />
      </div>

      <p className="flex items-center gap-3 text-prism-label text-prism-ink-2">
        <EyeOff aria-hidden className="h-5 w-5 shrink-0" strokeWidth={1.5} />
        Totals only. You do not see who read or reported.
      </p>
    </section>
  );
}

/**
 * My Pool, Broadcasts (board br2 and br1). Phase 1: all members, Amped inbox
 * only, invite-only pilot. Spec: docs/features/creator-pool-broadcast.md.
 */
export function BroadcastsTab({ chainId }: { chainId: string }) {
  const { profile } = useEditor();
  const [params, setParams] = useSearchParams();
  const composing = params.get("compose") === "1";
  const selectedParam = Number(params.get("b")) || null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      current => {
        const next = new URLSearchParams(current);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true }
    );

  const overview = useQuery(trpc.broadcast.creator.overview.queryOptions({ chainId }));
  const list = useQuery({
    ...trpc.broadcast.creator.list.queryOptions({ chainId }),
    enabled: !!overview.data?.pool,
    // Keep chips current while a send is in flight (QA-031); stops once none is
    refetchInterval: q =>
      q.state.data?.some(b => b.status === "QUEUED" || b.status === "SENDING") ? 5000 : false,
  });
  const showSkeleton = useDelayed(overview.isLoading || list.isLoading, 400);

  if (overview.isLoading || (overview.data?.pool && list.isLoading)) {
    return showSkeleton ? (
      <div aria-hidden className="h-96 rounded-prism-21 bg-prism-line/60" />
    ) : null;
  }
  if (overview.isError || !overview.data) {
    return (
      <ErrorCard
        title="Broadcasts did not load"
        cause="Try again in a moment."
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const { pool, members, quota, canSend, paused, verification, graceSendsLeft, creatorName } =
    overview.data;
  const items = list.data ?? [];
  const selected = selectedParam ?? items[0]?.id ?? null;

  if (!pool) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Broadcasts need a pool"
        description="Create your pool first. Then you can send updates to its members."
      />
    );
  }

  const blocker = !canSend
    ? {
        title: "Broadcasts are invite only for now",
        body: "Amped is opening broadcasts to pool owners in small groups, by invitation.",
      }
    : paused
      ? {
          title: "Broadcasting is paused",
          body: "Amped is reviewing reports on a recent broadcast. Support will contact you by email.",
        }
      : // Verification grace (Rob, 2026-10-10): a new creator sends for 30 days
        // or EMAIL_VERIFICATION_GRACE_BROADCASTS sends before this notice holds
        verification.required
        ? verification.reason === "milestone"
          ? {
              title: "Confirm your email to keep sending",
              body: `You have sent ${EMAIL_VERIFICATION_GRACE_BROADCASTS} broadcasts without a verified email. Open the confirmation email Amped sent you, then come back here.`,
            }
          : {
              title: "Confirm your email to send",
              body: `Accounts send without a verified email for ${EMAIL_VERIFICATION_GRACE_DAYS} days. Open the confirmation email Amped sent you, then come back here.`,
            }
        : null;

  // Unverified but still inside the grace: say how much room is left
  const graceLine =
    !blocker && !verification.verified && graceSendsLeft !== null
      ? `${graceSendsLeft} ${graceSendsLeft === 1 ? "send" : "sends"} left before Amped asks you to confirm your email.`
      : null;

  if (composing && !blocker) {
    return (
      <Composer
        chainId={chainId}
        poolName={pool.name ?? "your pool"}
        members={members}
        creatorName={creatorName || profile.name}
        creatorAvatar={profile.photoUrl}
        leftToday={quota.leftToday}
        nextSendReviewed={quota.nextSendReviewed}
        onCancel={() => setParam("compose", null)}
        onSent={id =>
          setParams(
            current => {
              const next = new URLSearchParams(current);
              next.delete("compose");
              next.set("b", String(id));
              return next;
            },
            { replace: true }
          )
        }
      />
    );
  }

  const newButton = (
    <Button
      size="lg"
      onClick={() => setParam("compose", "1")}
      disabled={!!blocker || members === 0 || quota.leftToday <= 0}
    >
      <Megaphone aria-hidden />
      New broadcast
    </Button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-prism-label text-prism-ink-2">
          {members.toLocaleString()} {members === 1 ? "member" : "members"} in{" "}
          {pool.name ?? "your pool"}.
          {/* The quota means nothing until the creator is invited (QA-037) */}
          {canSend &&
            (quota.leftToday > 0
              ? ` ${quota.leftToday} ${quota.leftToday === 1 ? "send" : "sends"} left today.`
              : " No sends left today.")}
        </p>
        {newButton}
      </div>

      {blocker && (
        <Notice variant={paused ? "warning" : "info"} title={blocker.title}>
          {blocker.body}
        </Notice>
      )}
      {graceLine && (
        <Notice variant="info" title="Your email is not verified yet">
          {graceLine}
        </Notice>
      )}
      {!blocker && members === 0 && (
        <Notice variant="info" title="Your pool has no members yet">
          Share your pool. When people join, you can send them updates here.
        </Notice>
      )}

      {list.isError ? (
        <ErrorCard
          title="Your broadcasts did not load"
          cause="Try again in a moment."
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No broadcasts yet"
          description="Send your members an update about your work. It lands in their Amped inbox."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <ul
            aria-label="Your broadcasts"
            className="prism-slab min-w-0 space-y-1 self-start rounded-prism-21 p-2"
          >
            {items.map(b => (
              <li key={b.id}>
                <button
                  type="button"
                  aria-current={b.id === selected ? "true" : undefined}
                  onClick={() => setParam("b", String(b.id))}
                  className={cn(
                    "prism-focus flex w-full flex-col gap-2 rounded-prism-13 px-4 py-3 text-left",
                    b.id === selected ? "prism-lens-thumb" : "hover:bg-white/50"
                  )}
                >
                  <span className="line-clamp-2 text-prism-label font-semibold text-prism-ink">
                    {b.title}
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    <StatusChip b={b} />
                    <span className="text-prism-meta text-prism-ink-2">
                      {shortTime(b.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected && <Detail id={selected} creatorName={creatorName || profile.name} />}
        </div>
      )}
    </div>
  );
}
