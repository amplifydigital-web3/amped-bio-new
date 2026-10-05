import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { EmptyState, ErrorCard, trpc } from "@repo/ui";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { formatNumber, formatPercent, rampColor, rampStep, rampText } from "./format";
import { SkeletonBlock, useShowAfter } from "./Skeleton";

function formatWeek(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type Picked = { cohort: string; week: number; returned: number; size: number };

/**
 * Screen Review 093 I27 to I29: Returning visitors on Audience, full width.
 * Cohort cells use the D3 ramp with ink text up to 0.62 and white only on
 * 0.85 (4.81:1). Coverage comes from the same 8 week window as the cohorts,
 * so changing the range never changes it. Tap or focus a cell to read it.
 */
export function RetentionCard({ tzOffsetMinutes }: { tzOffsetMinutes: number }) {
  const { data, isLoading, isError, refetch } = useQuery(
    trpc.analytics.retention.queryOptions({ tzOffsetMinutes })
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const skeleton = useShowAfter(isLoading);
  const cohorts = data?.cohorts ?? [];
  const weeks = cohorts[0]?.weeks.length ?? 7;
  const maxRate = Math.max(
    0,
    ...cohorts.flatMap(cohort => cohort.weeks.map(cell => cell?.rate ?? 0))
  );

  return (
    <AnalyticsCard
      id="retention"
      title="Returning visitors"
      meta="First visits in the last 8 weeks"
      info={DEFINITIONS.retention}
      source={SOURCES.consentedEvents}
    >
      {isError ? (
        <ErrorCard
          title="Returning visitors did not load"
          onRetry={() => void refetch()}
          retryLabel="Retry"
        />
      ) : isLoading ? (
        skeleton ? (
          <SkeletonBlock className="h-[233px]" />
        ) : (
          <div className="h-[233px]" />
        )
      ) : cohorts.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No retention data yet"
          description="Retention only includes visitors who tap Accept all or allow Return visits on your page's privacy banner. It fills in after those visitors come back in later weeks."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-[13px] gap-y-1">
            <span className="text-prism-card-title tabular-nums text-prism-ink">
              {data?.returningShare === null || data?.returningShare === undefined
                ? "No data"
                : formatPercent(data.returningShare, 0)}
            </span>
            <span className="text-prism-meta text-prism-ink-2">of opted in visitors</span>
          </div>

          <div className="prism-slab relative mt-[13px] overflow-x-auto">
            <table className="w-full min-w-[560px] border-separate border-spacing-[3px] text-left">
              <caption className="sr-only">
                Weekly retention cohorts. Rows are the week of the first visit, columns are weeks
                after.
              </caption>
              <thead>
                <tr className="text-prism-meta text-prism-ink-2">
                  <th
                    scope="col"
                    className="sticky left-0 z-[1] h-touch bg-white/90 px-2 font-normal"
                  >
                    First visit week
                  </th>
                  <th scope="col" className="h-touch px-2 text-right font-normal">
                    Visitors
                  </th>
                  {Array.from({ length: weeks }).map((_, index) => (
                    <th key={index} scope="col" className="h-touch text-center font-normal">
                      Wk {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(cohort => (
                  <tr key={cohort.cohortStart}>
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] h-touch whitespace-nowrap bg-white/90 px-2 text-prism-meta font-normal text-prism-ink"
                    >
                      {formatWeek(cohort.cohortStart)}
                    </th>
                    <td className="h-touch px-2 text-right text-prism-meta tabular-nums text-prism-ink">
                      {formatNumber(cohort.size)}
                    </td>
                    {cohort.weeks.map((cell, index) => {
                      if (!cell) {
                        return (
                          <td key={index} className="h-touch text-center text-prism-meta">
                            <span className="sr-only">Not finished yet</span>
                          </td>
                        );
                      }
                      const step = cell.rate > 0 ? rampStep(cell.rate, maxRate) : null;
                      const pick = () =>
                        setPicked({
                          cohort: formatWeek(cohort.cohortStart),
                          week: cell.week,
                          returned: cell.returned,
                          size: cohort.size,
                        });
                      return (
                        <td key={index} className="h-touch p-0">
                          <button
                            type="button"
                            onClick={pick}
                            onFocus={pick}
                            aria-label={`${cell.returned} of ${cohort.size} came back in week ${cell.week}`}
                            className="prism-focus h-touch w-full min-w-[44px] rounded-prism-5 text-center text-prism-meta tabular-nums"
                            style={
                              step === null
                                ? {
                                    backgroundColor: "#FFFFFF",
                                    boxShadow: "inset 0 0 0 1px rgba(22,21,43,0.10)",
                                    color: "#16152B",
                                  }
                                : { backgroundColor: rampColor(step), color: rampText(step) }
                            }
                          >
                            {Math.round(cell.rate * 100)}%
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p aria-live="polite" className="mt-2 min-h-[16px] text-prism-meta text-prism-ink">
            {picked
              ? `First visit week of ${picked.cohort}: ${picked.returned} of ${picked.size} came back in week ${picked.week}.`
              : ""}
          </p>
          <p className="mt-1 text-prism-meta text-prism-ink-2">
            Based on visitors who allowed return visits: {formatPercent(data?.coverage ?? 0, 0)} of
            visitors in these 8 weeks. Empty cells are weeks that have not finished yet.
          </p>
        </>
      )}
    </AnalyticsCard>
  );
}
