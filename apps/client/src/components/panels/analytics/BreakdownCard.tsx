import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChipGroup, ErrorCard, trpc } from "@repo/ui";
import type { AnalyticsBreakdownDimension, AnalyticsRangePreset } from "@repo/constants";
import { AnalyticsCard } from "./AnalyticsCard";
import { SOURCES } from "./definitions";
import { DATA_PALETTE, capitalize, countryName, formatNumber } from "./format";
import { SkeletonRows } from "./Skeleton";

export type BreakdownTab = { dimension: AnalyticsBreakdownDimension; label: string };

function formatLabel(dimension: AnalyticsBreakdownDimension, label: string) {
  if (label === "Unknown") return label;
  // 093 I34: country by name, no emoji flag
  if (dimension === "country") return countryName(label);
  if (dimension === "device") return capitalize(label);
  return label;
}

/** The rows and states of one breakdown, shared by the cards and the link detail. */
export function BreakdownList({
  title,
  tabs,
  range,
  tzOffsetMinutes,
  blockId,
  enabled = true,
}: {
  title: string;
  tabs: BreakdownTab[];
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  blockId?: number;
  enabled?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].dimension);
  // When scoped to one link, rank by clicks instead of views
  const metric: "views" | "clicks" = blockId ? "clicks" : "views";

  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.analytics.breakdown.queryOptions({
      range,
      tzOffsetMinutes,
      dimension: active,
      limit: 10,
      blockId,
    }),
    enabled,
  });

  const rows = (data ?? []).filter(row => row[metric] > 0);
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  const max = Math.max(1, ...rows.map(row => row[metric]));

  return (
    <div className="font-prism">
      {tabs.length > 1 && (
        <ChipGroup
          label={`${title} by`}
          options={tabs.map(tab => ({ value: tab.dimension, label: tab.label }))}
          value={active}
          onChange={setActive}
          className="mb-[13px]"
        />
      )}

      {isError ? (
        <ErrorCard
          title={`${title} did not load`}
          onRetry={() => void refetch()}
          retryLabel="Retry"
        />
      ) : isLoading ? (
        <SkeletonRows active={isLoading} />
      ) : rows.length === 0 ? (
        <p className="py-[13px] text-prism-body text-prism-ink-2">
          {blockId ? "No clicks in this period yet." : "No visits in this period yet."}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map(row => {
            const value = row[metric];
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            return (
              <li key={row.label} className="relative overflow-hidden rounded-prism-8">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-prism-8"
                  style={{ width: `${(value / max) * 100}%`, backgroundColor: DATA_PALETTE.bar }}
                />
                <div className="relative flex min-h-commit items-center justify-between gap-[13px] px-[13px] py-1">
                  <div className="min-w-0">
                    <p className="truncate text-prism-label text-prism-ink">
                      {formatLabel(active, row.label)}
                    </p>
                    <p className="text-prism-meta tabular-nums text-prism-ink-2">
                      {formatNumber(row.visitors)} {row.visitors === 1 ? "visitor" : "visitors"},{" "}
                      {formatNumber(row.clicks)} {row.clicks === 1 ? "click" : "clicks"}
                    </p>
                  </div>
                  <p className="shrink-0 text-right tabular-nums">
                    <span className="text-prism-label font-semibold text-prism-ink">
                      {formatNumber(value)}
                    </span>
                    <span className="sr-only"> {metric}, </span>
                    <span className="ml-2 text-prism-meta text-prism-ink-2">{share}%</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Screen Review 093 I34, I35: a breakdown card with Prism chips, 55 rows and its own states. */
export function BreakdownCard({
  title,
  description,
  info,
  tabs,
  range,
  tzOffsetMinutes,
  className,
  id,
}: {
  title: string;
  description?: string;
  info?: string;
  tabs: BreakdownTab[];
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  className?: string;
  id?: string;
}) {
  return (
    <AnalyticsCard
      id={id}
      title={title}
      description={description}
      info={info}
      source={SOURCES.pageEvents}
      className={className}
    >
      <BreakdownList title={title} tabs={tabs} range={range} tzOffsetMinutes={tzOffsetMinutes} />
    </AnalyticsCard>
  );
}
