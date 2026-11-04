import { useQuery } from "@tanstack/react-query";
import { ErrorCard, Skeleton, trpc } from "@repo/ui";
import { WordBadge, type BadgeTone } from "../../kit/WordBadge";
import { formatCount } from "../../kit/format";

// Content takedown 4.3 (board tk2). Whether hides, deletes and suspensions have
// reached the media edge. Counts only: the tile never shows an item or a key.

const STATE: Record<string, { label: string; tone: BadgeTone; note: string }> = {
  healthy: {
    label: "Healthy",
    tone: "success",
    note: "Takedowns reach the edge within a minute.",
  },
  behind: {
    label: "Behind",
    tone: "warning",
    note: "Some takedowns are waiting. The sync retries on its own; check the server log if this stays.",
  },
  not_configured: {
    label: "Not configured",
    tone: "danger",
    note: "The Cloudflare takedown settings are missing, so old links keep working after a takedown.",
  },
};

function waitLabel(ms: number | null): string {
  if (ms === null) return "Nothing waiting";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function TakedownSyncCard() {
  const health = useQuery({
    ...trpc.admin.dashboard.takedownSync.queryOptions(),
    refetchInterval: 60_000,
  });

  if (health.isPending) {
    return (
      <div aria-busy className="prism-glass-clear !rounded-prism-21 p-5">
        <Skeleton delayMs={400} className="h-6 w-40" />
        <Skeleton delayMs={400} className="mt-4 h-4 w-full" />
      </div>
    );
  }
  if (health.isError || !health.data) {
    return (
      <ErrorCard
        title="Takedown sync did not load"
        cause="Check your connection, then try again."
        retryLabel="Retry"
        onRetry={() => void health.refetch()}
      />
    );
  }

  const data = health.data;
  const state = STATE[data.state] ?? STATE.behind!;
  return (
    <section
      aria-labelledby="takedown-sync"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5 font-prism"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="takedown-sync" className="text-prism-panel-title text-prism-ink">
          Takedown sync
        </h3>
        <WordBadge tone={state.tone}>{state.label}</WordBadge>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Waiting</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {formatCount(data.waiting)}
          </dd>
        </div>
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Oldest wait</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {waitLabel(data.oldestWaitMs)}
          </dd>
        </div>
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Failing 5+ times</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {formatCount(data.failures)}
          </dd>
        </div>
        <div>
          <dt className="text-prism-meta text-prism-ink-2">Last run</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {data.lastRunAt
              ? new Date(data.lastRunAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Not yet"}
          </dd>
        </div>
      </dl>
      <p className="text-prism-meta text-prism-ink-2">{state.note}</p>
    </section>
  );
}
