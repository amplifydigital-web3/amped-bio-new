import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { AnalyticsAudience, AnalyticsSummary } from "./format";
import { formatDuration, formatNumber, formatPercent, relativeChange } from "./format";
import { DEFINITIONS, SOURCES } from "./definitions";
import { InfoTip } from "./InfoTip";

type Tile = {
  key: string;
  label: string;
  // Full name in the popover when the tile label is short (093 I14)
  infoLabel?: string;
  value: string;
  change: number | null;
  // For rates the change is shown in percentage points instead of relative change
  pointsDelta?: number | null;
  info: string;
  source: string;
  // Context under the change line, such as coverage
  note?: string;
};

/**
 * 093 I12, I13: the change line is 13/16 with a 13 arrow, success up and
 * danger down, and the words increase or decrease for screen readers. Missing
 * baselines read No prior data in ink-2 (8.04:1), never pale gray.
 */
function Change({
  change,
  points,
  hasPrevious,
}: {
  change: number | null;
  points?: number | null;
  hasPrevious: boolean;
}) {
  if (!hasPrevious)
    return <span className="text-prism-meta text-prism-ink-2">No prior period</span>;
  const value = points ?? change;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-prism-meta text-prism-ink-2">No prior data</span>;
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text =
    points !== undefined && points !== null
      ? `${up ? "+" : ""}${(points * 100).toFixed(1)} pts`
      : `${up ? "+" : ""}${formatPercent(value, 0)}`;
  return (
    <span
      className={`inline-flex items-center gap-1 text-prism-meta tabular-nums ${up ? "text-prism-success" : "text-prism-danger"}`}
    >
      <Icon className="h-[13px] w-[13px]" aria-hidden />
      <span className="sr-only">{up ? "Increase" : "Decrease"}, </span>
      {text} vs previous period
    </span>
  );
}

function TileCard({ tile, hasPrevious }: { tile: Tile; hasPrevious: boolean }) {
  return (
    <div className="prism-glass-clear flex min-w-0 flex-col !rounded-prism-21 p-[13px] font-prism md:p-[21px]">
      <div className="-my-[13px] flex min-h-touch items-center justify-between gap-1">
        <span className="truncate text-prism-label font-semibold text-prism-ink-2">
          {tile.label}
        </span>
        <InfoTip label={tile.infoLabel ?? tile.label} text={tile.info} source={tile.source} />
      </div>
      <div className="mt-[13px] text-prism-card-title tabular-nums text-prism-ink">
        {tile.value}
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        <Change change={tile.change} points={tile.pointsDelta} hasPrevious={hasPrevious} />
        {tile.note && <span className="text-prism-meta text-prism-ink-2">{tile.note}</span>}
      </div>
    </div>
  );
}

/**
 * Screen Review 093 I12, I14: four headline tiles (Views, Visitors, Link
 * clicks, Click-through) in one row at 1440 and 2 by 2 at 390. The secondary
 * four share the anatomy and open from Show 4 more metrics (I04).
 */
export function KpiTiles({
  summary,
  previous,
  audience,
  previousAudience,
  showMore,
}: {
  summary: AnalyticsSummary;
  previous: AnalyticsSummary | null;
  audience: AnalyticsAudience;
  previousAudience: AnalyticsAudience | null;
  showMore: boolean;
}) {
  const returningShare =
    audience.consentedVisitors > 0 ? audience.returningVisitors / audience.consentedVisitors : null;
  const coverage = summary.visitors > 0 ? audience.consentedVisitors / summary.visitors : 0;
  const previousReturningShare =
    previousAudience && previousAudience.consentedVisitors > 0
      ? previousAudience.returningVisitors / previousAudience.consentedVisitors
      : null;
  const hasPrevious = previous !== null || previousAudience !== null;

  const headline: Tile[] = [
    {
      key: "views",
      label: "Views",
      value: formatNumber(summary.views),
      change: relativeChange(summary.views, previous?.views),
      info: DEFINITIONS.views,
      source: SOURCES.pageEvents,
    },
    {
      key: "visitors",
      label: "Visitors",
      value: formatNumber(summary.visitors),
      change: relativeChange(summary.visitors, previous?.visitors),
      info: DEFINITIONS.visitors,
      source: SOURCES.pageEvents,
    },
    {
      key: "clicks",
      label: "Link clicks",
      value: formatNumber(summary.clicks),
      change: relativeChange(summary.clicks, previous?.clicks),
      info: DEFINITIONS.clicks,
      source: SOURCES.pageEvents,
    },
    {
      key: "visitorCtr",
      label: "Click-through",
      infoLabel: "Visitor click-through",
      value: formatPercent(summary.visitorCtr),
      change: null,
      pointsDelta:
        previous && previous.visitors > 0 ? summary.visitorCtr - previous.visitorCtr : null,
      info: DEFINITIONS.visitorClickThrough,
      source: SOURCES.pageEvents,
    },
  ];

  const secondary: Tile[] = [
    {
      key: "ctr",
      label: "Clicks per view",
      value: formatPercent(summary.ctr),
      change: null,
      pointsDelta: previous && previous.views > 0 ? summary.ctr - previous.ctr : null,
      info: DEFINITIONS.clicksPerView,
      source: SOURCES.pageEvents,
    },
    {
      key: "engagement",
      label: "Time on page",
      value: formatDuration(summary.avgEngagementSeconds),
      change: relativeChange(summary.avgEngagementSeconds, previous?.avgEngagementSeconds),
      info: DEFINITIONS.timeOnPage,
      source: SOURCES.pageEvents,
    },
    {
      key: "members",
      label: "New members",
      value: formatNumber(audience.newMembers),
      change: relativeChange(audience.newMembers, previousAudience?.newMembers),
      info: `${DEFINITIONS.newMembers} ${DEFINITIONS.memberConversion}`,
      source: SOURCES.referrals,
      note: `${formatPercent(audience.memberConversion)} of visitors, ${formatNumber(audience.totalMembers)} all time`,
    },
    {
      key: "returning",
      label: "Returning visitors",
      value: returningShare === null ? "No data" : formatPercent(returningShare, 0),
      change: null,
      pointsDelta:
        returningShare !== null && previousReturningShare !== null
          ? returningShare - previousReturningShare
          : null,
      info: `${DEFINITIONS.returning} ${DEFINITIONS.coverage}`,
      source: SOURCES.consentedEvents,
      note:
        audience.consentedVisitors > 0
          ? `${formatNumber(audience.returningVisitors)} of ${formatNumber(audience.consentedVisitors)} opted in, ${formatPercent(coverage, 0)} coverage`
          : "No visitors have opted in yet",
    },
  ];

  const grid = "grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]";
  return (
    <>
      <div className={grid}>
        {headline.map(tile => (
          <TileCard key={tile.key} tile={tile} hasPrevious={hasPrevious} />
        ))}
      </div>
      {showMore && (
        <div id="more-metrics" className={grid}>
          {secondary.map(tile => (
            <TileCard key={tile.key} tile={tile} hasPrevious={hasPrevious} />
          ))}
        </div>
      )}
    </>
  );
}
