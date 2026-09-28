import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { formatNumber } from "./format";

// Sequential single hue ramp shared with the heatmap
const RAMP = ["#f1f5fb", "#cfe0f5", "#9fc1ea", "#6ba0dd", "#2a78d6", "#1b56a0"];

function shade(rate: number) {
  if (rate <= 0) return RAMP[0];
  return RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(rate * 2 * (RAMP.length - 2)))];
}

function formatWeek(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RetentionCard({
  tzOffsetMinutes,
  coverage,
}: {
  tzOffsetMinutes: number;
  // Share of visitors in the selected period who allowed return visits
  coverage: number;
}) {
  const { data, isLoading, isError } = useQuery(
    trpc.analytics.retention.queryOptions({ tzOffsetMinutes })
  );
  const cohorts = data?.cohorts ?? [];
  const weeks = cohorts[0]?.weeks.length ?? 7;

  return (
    <AnalyticsCard
      title="Fan retention"
      description="Share of first-time visitors who came back in later weeks"
      info={DEFINITIONS.retention}
      source={SOURCES.consentedEvents}
      period="First visits in the last 8 weeks"
      updatedAt={data?.generatedAt}
    >
      {isLoading ? (
        <div className="h-40 bg-gray-100 rounded animate-pulse" />
      ) : isError ? (
        <p className="text-sm text-red-700 py-4">Could not load retention.</p>
      ) : cohorts.length === 0 ? (
        <div className="text-sm text-gray-600 py-2 space-y-2">
          <p>No retention data yet.</p>
          <p className="text-xs text-gray-500">
            Retention only includes visitors who tap Accept all or allow Return visits on your
            page's privacy banner. It fills in after those visitors come back in later weeks.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[520px]">
            <caption className="sr-only">
              Weekly retention cohorts. Rows are the week of the first visit, columns are weeks
              after.
            </caption>
            <thead>
              <tr className="text-gray-500">
                <th className="text-left font-medium py-1 pr-2">First visit week</th>
                <th className="text-right font-medium py-1 pr-2">Visitors</th>
                {Array.from({ length: weeks }).map((_, index) => (
                  <th key={index} className="font-medium py-1 text-center">
                    Wk {index + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map(cohort => (
                <tr key={cohort.cohortStart}>
                  <td className="py-0.5 pr-2 text-gray-700 whitespace-nowrap">
                    {formatWeek(cohort.cohortStart)}
                  </td>
                  <td className="py-0.5 pr-2 text-right tabular-nums text-gray-700">
                    {formatNumber(cohort.size)}
                  </td>
                  {cohort.weeks.map((cell, index) => (
                    <td key={index} className="p-0.5">
                      {cell ? (
                        <div
                          className={`rounded-[4px] py-1.5 text-center tabular-nums ${cell.rate >= 0.25 ? "text-white" : "text-gray-800"}`}
                          style={{ backgroundColor: shade(cell.rate) }}
                          title={`${cell.returned} of ${cohort.size} came back in week ${cell.week}`}
                        >
                          {Math.round(cell.rate * 100)}%
                        </div>
                      ) : (
                        <div
                          className="rounded-[4px] py-1.5 text-center text-gray-300"
                          aria-label="Not yet available"
                        >
                          ·
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-500">
            Based on visitors who allowed return visits: {Math.round(coverage * 100)}% of unique
            visitors in the selected period. Empty cells are weeks that have not finished yet.
          </p>
        </div>
      )}
    </AnalyticsCard>
  );
}
