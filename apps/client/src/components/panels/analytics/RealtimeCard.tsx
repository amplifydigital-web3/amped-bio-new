import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import { formatDistanceToNowStrict } from "date-fns";
import { Eye, MousePointerClick } from "lucide-react";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { capitalize, countryFlag } from "./format";

const REFRESH_MS = 15_000;

export function RealtimeCard() {
  const { data, isLoading } = useQuery({
    ...trpc.analytics.realtime.queryOptions(),
    refetchInterval: REFRESH_MS,
  });

  return (
    <AnalyticsCard
      title="Live"
      description="Last 30 minutes. Refreshes every 15 seconds."
      info={DEFINITIONS.live}
      source={SOURCES.pageEvents}
      updatedAt={data?.generatedAt}
      action={
        <span className="relative flex h-2.5 w-2.5 mt-1" aria-hidden>
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
      }
    >
      {isLoading || !data ? (
        <div className="h-24 bg-gray-100 rounded animate-pulse" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-gray-900 tabular-nums">
              {data.visitors}
            </span>
            <span className="text-sm text-gray-500">
              visitor{data.visitors === 1 ? "" : "s"} now · {data.views} views · {data.clicks}{" "}
              clicks
            </span>
          </div>

          <ul className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
            {data.recent.length === 0 && (
              <li className="text-sm text-gray-500">
                No activity yet. Share your page to see visits live.
              </li>
            )}
            {data.recent.map(event => (
              <li key={event.id} className="flex items-center gap-2 text-xs text-gray-700">
                {event.type === "click" ? (
                  <MousePointerClick
                    className="w-3.5 h-3.5 text-gray-500 shrink-0"
                    aria-label="Click"
                  />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-gray-500 shrink-0" aria-label="View" />
                )}
                <span className="truncate flex-1">
                  {event.country ? `${countryFlag(event.country)} ` : ""}
                  {event.type === "click"
                    ? `Clicked "${event.linkLabel ?? "a link"}"`
                    : `Visited from ${event.source}`}
                  <span className="text-gray-400"> · {capitalize(event.device)}</span>
                </span>
                <span className="text-gray-400 shrink-0">
                  {formatDistanceToNowStrict(new Date(event.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </AnalyticsCard>
  );
}
