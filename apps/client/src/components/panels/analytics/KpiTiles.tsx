import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Eye,
  MousePointerClick,
  Percent,
  Repeat,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import type { AnalyticsAudience, AnalyticsSummary } from "./format";
import { formatDuration, formatNumber, formatPercent, relativeChange } from "./format";
import { DEFINITIONS, SOURCES } from "./definitions";
import { InfoTip } from "./InfoTip";

type Tile = {
  key: string;
  label: string;
  icon: React.ElementType;
  value: string;
  change: number | null;
  // For rates the delta is shown in percentage points instead of relative change
  pointsDelta?: number | null;
  info: string;
  source: string;
  // Replaces the delta line, for context such as coverage
  note?: string;
};

function Delta({ change, points }: { change: number | null; points?: number | null }) {
  const value = points ?? change;
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-xs text-gray-400">No prior data</span>;
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const text =
    points !== undefined && points !== null
      ? `${up ? "+" : ""}${(points * 100).toFixed(1)} pts`
      : `${up ? "+" : ""}${formatPercent(value, 0)}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-emerald-700" : "text-red-700"}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {text}
      <span className="sr-only">{up ? "increase" : "decrease"} vs previous period</span>
    </span>
  );
}

export function KpiTiles({
  summary,
  previous,
  audience,
  previousAudience,
  periodLabel,
  updatedAt,
}: {
  summary: AnalyticsSummary;
  previous: AnalyticsSummary | null;
  audience: AnalyticsAudience;
  previousAudience: AnalyticsAudience | null;
  periodLabel: string;
  updatedAt: Date | string;
}) {
  const returningShare =
    audience.consentedVisitors > 0 ? audience.returningVisitors / audience.consentedVisitors : null;
  const coverage = summary.visitors > 0 ? audience.consentedVisitors / summary.visitors : 0;
  const previousReturningShare =
    previousAudience && previousAudience.consentedVisitors > 0
      ? previousAudience.returningVisitors / previousAudience.consentedVisitors
      : null;

  const tiles: Tile[] = [
    {
      key: "views",
      label: "Views",
      icon: Eye,
      value: formatNumber(summary.views),
      change: relativeChange(summary.views, previous?.views),
      info: DEFINITIONS.views,
      source: SOURCES.pageEvents,
    },
    {
      key: "visitors",
      label: "Unique visitors",
      icon: Users,
      value: formatNumber(summary.visitors),
      change: relativeChange(summary.visitors, previous?.visitors),
      info: DEFINITIONS.visitors,
      source: SOURCES.pageEvents,
    },
    {
      key: "clicks",
      label: "Link clicks",
      icon: MousePointerClick,
      value: formatNumber(summary.clicks),
      change: relativeChange(summary.clicks, previous?.clicks),
      info: DEFINITIONS.clicks,
      source: SOURCES.pageEvents,
    },
    {
      key: "visitorCtr",
      label: "Visitor click-through",
      icon: Target,
      value: formatPercent(summary.visitorCtr),
      change: null,
      pointsDelta:
        previous && previous.visitors > 0 ? summary.visitorCtr - previous.visitorCtr : null,
      info: DEFINITIONS.visitorClickThrough,
      source: SOURCES.pageEvents,
    },
    {
      key: "ctr",
      label: "Clicks per view",
      icon: Percent,
      value: formatPercent(summary.ctr),
      change: null,
      pointsDelta: previous && previous.views > 0 ? summary.ctr - previous.ctr : null,
      info: DEFINITIONS.clicksPerView,
      source: SOURCES.pageEvents,
    },
    {
      key: "engagement",
      label: "Avg. time on page",
      icon: Clock,
      value: formatDuration(summary.avgEngagementSeconds),
      change: relativeChange(summary.avgEngagementSeconds, previous?.avgEngagementSeconds),
      info: DEFINITIONS.timeOnPage,
      source: SOURCES.pageEvents,
    },
    {
      key: "members",
      label: "New members",
      icon: UserPlus,
      value: formatNumber(audience.newMembers),
      change: relativeChange(audience.newMembers, previousAudience?.newMembers),
      info: `${DEFINITIONS.newMembers} ${DEFINITIONS.memberConversion}`,
      source: SOURCES.referrals,
      note: `${formatPercent(audience.memberConversion)} of visitors · ${formatNumber(audience.totalMembers)} all time`,
    },
    {
      key: "returning",
      label: "Returning visitors",
      icon: Repeat,
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
          ? `${formatNumber(audience.returningVisitors)} of ${formatNumber(audience.consentedVisitors)} opted-in · ${formatPercent(coverage, 0)} coverage`
          : "No visitors have opted in yet",
    },
  ];

  const updated = new Date(updatedAt);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(tile => (
          <div
            key={tile.key}
            className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <tile.icon className="w-3.5 h-3.5" aria-hidden />
              {tile.label}
              <InfoTip text={`${tile.info} Source: ${tile.source}.`} label={tile.label} />
            </div>
            <div className="text-2xl font-semibold text-gray-900 tabular-nums">{tile.value}</div>
            {previous || previousAudience ? (
              <div className="flex flex-col gap-0.5">
                <Delta change={tile.change} points={tile.pointsDelta} />
                {tile.note && <span className="text-[11px] text-gray-500">{tile.note}</span>}
              </div>
            ) : (
              <span className="text-[11px] text-gray-500">{tile.note ?? "No prior period"}</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">
        {periodLabel} compared with the period before · Sources: {SOURCES.pageEvents}, and sign-ups
        through your page for members · Updated{" "}
        {formatDistanceToNowStrict(updated, { addSuffix: true })}
      </p>
    </div>
  );
}
