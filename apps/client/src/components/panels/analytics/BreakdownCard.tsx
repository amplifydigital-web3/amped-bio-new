import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@repo/ui";
import type { AnalyticsBreakdownDimension, AnalyticsRangePreset } from "@repo/constants";
import { AnalyticsCard } from "./AnalyticsCard";
import { SOURCES } from "./definitions";
import { RANGE_LABELS } from "./format";
import { SERIES_COLORS, capitalize, countryFlag, countryName, formatNumber } from "./format";

export type BreakdownTab = { dimension: AnalyticsBreakdownDimension; label: string };

function formatLabel(dimension: AnalyticsBreakdownDimension, label: string) {
  if (label === "Unknown") return label;
  if (dimension === "country") return `${countryFlag(label)} ${countryName(label)}`;
  if (dimension === "device") return capitalize(label);
  return label;
}

export function BreakdownCard({
  title,
  description,
  info,
  tabs,
  range,
  tzOffsetMinutes,
  blockId,
  enabled = true,
}: {
  title: string;
  description?: string;
  info?: string;
  tabs: BreakdownTab[];
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  blockId?: number;
  enabled?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].dimension);
  // When scoped to one link, rank by clicks instead of views
  const metric: "views" | "clicks" = blockId ? "clicks" : "views";

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
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
    <AnalyticsCard
      title={title}
      description={description}
      info={info}
      source={SOURCES.pageEvents}
      period={RANGE_LABELS[range]}
      updatedAt={dataUpdatedAt || null}
    >
      {tabs.length > 1 && (
        <div role="tablist" className="flex flex-wrap gap-1 mb-3">
          {tabs.map(tab => (
            <button
              key={tab.dimension}
              role="tab"
              aria-selected={active === tab.dimension}
              onClick={() => setActive(tab.dimension)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                active === tab.dimension
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-7 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-700 py-4">Could not load this breakdown.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No data for this period yet.</p>
      ) : (
        <ul className="space-y-1.5">
          <li className="flex justify-between text-xs text-gray-500 px-1">
            <span>{tabs.find(tab => tab.dimension === active)?.label}</span>
            <span>{metric === "views" ? "Views" : "Clicks"}</span>
          </li>
          {rows.map(row => {
            const value = row[metric];
            return (
              <li
                key={row.label}
                className="relative rounded-md overflow-hidden"
                title={`${row.visitors} unique visitors, ${row.clicks} clicks`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-md opacity-15"
                  style={{
                    width: `${(value / max) * 100}%`,
                    backgroundColor:
                      metric === "views" ? SERIES_COLORS.views : SERIES_COLORS.clicks,
                  }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                  <span className="truncate text-gray-800">{formatLabel(active, row.label)}</span>
                  <span className="shrink-0 tabular-nums text-gray-900 font-medium">
                    {formatNumber(value)}
                    <span className="text-gray-500 font-normal ml-2 text-xs">
                      {total > 0 ? `${Math.round((value / total) * 100)}%` : ""}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AnalyticsCard>
  );
}
