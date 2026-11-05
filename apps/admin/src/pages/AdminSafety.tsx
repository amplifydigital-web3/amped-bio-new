import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { SAFETY_CASE_LABELS, SAFETY_CASE_TYPES } from "@repo/constants";
import { ErrorCard, Skeleton, trpc } from "@repo/ui";
import { formatCount, formatDayTime } from "../kit/format";

/**
 * Safety, Review (Build Board #28, adult content review 8 and 8.1, PR R1). R1 shows
 * the queue summary tiles and the open cases by type; the queue, case view and
 * decisions arrive with R2 (boards ad1 and ad2). Moderators and safety leads only:
 * the API answers 403 to anyone else.
 */
export function AdminSafety() {
  const overview = useQuery(trpc.safety.overview.queryOptions());

  if (overview.isError) {
    return (
      <ErrorCard
        title="Safety did not load"
        cause="The case counts could not be read. Try again."
        retryLabel="Retry"
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const data = overview.data;
  const clock = data?.takedownClock ?? null;
  const tiles: Array<[string, string]> = data
    ? [
        ["Open", formatCount(data.open)],
        ["Overdue", formatCount(data.overdue)],
        ["Due today", formatCount(data.dueToday)],
        ["Take It Down clock", clock ? `Due ${formatDayTime(clock.dueAt)}` : "None open"],
      ]
    : [];

  return (
    <div className="space-y-[21px]">
      <div
        aria-label="Queue summary"
        role="group"
        className="grid grid-cols-2 gap-[13px] xl:grid-cols-4"
      >
        {overview.isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} delayMs={400} className="h-[89px] rounded-prism-21" />
            ))
          : tiles.map(([label, value]) => (
              <div key={label} className="prism-glass-clear !rounded-prism-21 p-[13px]">
                <p className="text-prism-eyebrow uppercase text-prism-ink-2">{label}</p>
                <p className="mt-1 text-[28px] font-bold leading-[34px] tabular-nums text-prism-ink">
                  {value}
                </p>
              </div>
            ))}
      </div>

      <section aria-labelledby="safety-types" className="prism-slab p-[13px]">
        <h2 id="safety-types" className="text-prism-panel-title text-prism-ink">
          Open cases by type
        </h2>
        {data && (
          <ul className="mt-[13px] divide-y divide-prism-line">
            {SAFETY_CASE_TYPES.map(type => (
              <li key={type} className="flex h-touch items-center justify-between gap-[13px] px-1">
                <span className="text-prism-body text-prism-ink">{SAFETY_CASE_LABELS[type]}</span>
                <span className="tabular-nums text-prism-body text-prism-ink-2">
                  {formatCount(data.byType[type] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-[13px] flex items-center gap-2 text-prism-meta text-prism-ink-2">
          <ShieldCheck aria-hidden className="h-4 w-4" />
          The queue and case view open here with the next Safety release.
        </p>
      </section>
    </div>
  );
}
