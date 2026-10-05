import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, Eye, MousePointerClick } from "lucide-react";
import { toast } from "react-hot-toast";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { capitalize, countryName, formatNumber } from "./format";

const REFRESH_MS = 15_000;
const ROWS_AT_REST = 5;

function LiveDot() {
  // 093 I19: a static 8 success dot, no ping animation
  return <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-prism-success" />;
}

/**
 * Screen Review 093 I18, I19 and D4: visits in the last 30 minutes only
 * (filtered on the server), with source, country and device and never city.
 * Count 26/33, five 44 rows at rest, Show more for up to 15, a local error
 * card with Retry, and an empty state with Copy page link.
 */
export function RealtimeCard({ handle, className }: { handle: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.analytics.realtime.queryOptions(),
    refetchInterval: REFRESH_MS,
  });

  const copyPageLink = () => {
    void navigator.clipboard
      .writeText(`https://amped.bio/${handle}`)
      .then(() => toast.success("Page link copied"))
      .catch(() => toast.error("Could not copy the link"));
  };

  const rows = data ? (expanded ? data.recent : data.recent.slice(0, ROWS_AT_REST)) : [];

  return (
    <AnalyticsCard
      id="live"
      title="Live"
      meta={
        <span className="inline-flex items-center gap-2">
          <LiveDot />
          Last 30 minutes. Refreshes every 15 seconds.
        </span>
      }
      info={DEFINITIONS.live}
      source={SOURCES.pageEvents}
      className={className}
    >
      {isError && !data ? (
        <ErrorCard title="Live did not update" onRetry={() => void refetch()} retryLabel="Retry" />
      ) : isLoading || !data ? (
        <div aria-hidden className="space-y-2">
          <div className="h-[33px] w-24 rounded-prism-8 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse" />
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="h-touch rounded-prism-13 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-prism-card-title tabular-nums text-prism-ink">
              {formatNumber(data.visitors)}
            </span>
            <span className="text-prism-label text-prism-ink">
              {data.visitors === 1 ? "visitor now" : "visitors now"}
            </span>
          </p>
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            {formatNumber(data.views)} {data.views === 1 ? "view" : "views"},{" "}
            {formatNumber(data.clicks)} {data.clicks === 1 ? "click" : "clicks"}
          </p>

          {data.recent.length === 0 ? (
            <div className="mt-[13px]">
              <p className="text-prism-body text-prism-ink-2">
                No visits in the last 30 minutes. Share your page to see visits live.
              </p>
              <Button variant="secondary" className="mt-[13px]" onClick={copyPageLink}>
                <Copy aria-hidden />
                Copy page link
              </Button>
            </div>
          ) : (
            <>
              <ul className="mt-[13px] divide-y divide-prism-line">
                {rows.map(event => {
                  const Icon = event.type === "click" ? MousePointerClick : Eye;
                  const where = [event.country ? countryName(event.country) : null]
                    .concat(event.device ? capitalize(event.device) : null)
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li key={event.id} className="flex min-h-touch items-center gap-[13px] py-1">
                      <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-prism-label text-prism-ink">
                          {event.type === "click"
                            ? `Clicked ${event.linkLabel ?? "a link"}`
                            : `Visited from ${event.source}`}
                        </p>
                        {where && <p className="text-prism-meta text-prism-ink-2">{where}</p>}
                      </div>
                      <span className="shrink-0 text-prism-meta tabular-nums text-prism-ink-2">
                        {formatDistanceToNowStrict(new Date(event.createdAt), { addSuffix: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {data.recent.length > ROWS_AT_REST && (
                <Button
                  variant="ghost"
                  className="mt-2"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(open => !open)}
                >
                  {expanded ? "Show less" : "Show more"}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </AnalyticsCard>
  );
}
