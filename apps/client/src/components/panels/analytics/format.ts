import type { AnalyticsRangePreset } from "@repo/constants";
import type { RouterOutputs } from "@repo/ui";

export type AnalyticsDashboard = NonNullable<RouterOutputs["analytics"]["dashboard"]>;
export type AnalyticsSummary = AnalyticsDashboard["summary"];
export type AnalyticsLink = AnalyticsDashboard["links"][number];
export type AnalyticsInsight = AnalyticsDashboard["insights"][number];
export type AnalyticsTimeseriesPoint = AnalyticsDashboard["timeseries"][number];
export type AnalyticsAudience = AnalyticsDashboard["audience"];
export type AnalyticsCampaign = NonNullable<
  RouterOutputs["analytics"]["campaigns"]
>["campaigns"][number];
export type AnalyticsRetention = NonNullable<RouterOutputs["analytics"]["retention"]>;

// Series colors. Views and clicks are always drawn in these slots.
export const SERIES_COLORS = {
  views: "#2a78d6",
  visitors: "#1baf7a",
  clicks: "#eb6834",
} as const;

export const RANGE_LABELS: Record<AnalyticsRangePreset, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
  all: "All time",
};

export const RANGE_SHORT_LABELS: Record<AnalyticsRangePreset, string> = {
  "24h": "24h",
  "7d": "7d",
  "28d": "28d",
  "90d": "90d",
  "365d": "12m",
  all: "All",
};

// Minutes to add to UTC to reach the viewer's local time
export function getTzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return value >= 10_000 ? compact.format(value) : value.toLocaleString("en-US");
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

// Relative change, or null when there is no baseline to compare with
export function relativeChange(current: number, previous: number | undefined | null) {
  if (previous === undefined || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function formatBucketLabel(bucket: string, granularity: "hour" | "day"): string {
  if (granularity === "hour") {
    const hour = Number(bucket.slice(11, 13));
    const suffix = hour < 12 ? "am" : "pm";
    return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
  }
  const [year, month, day] = bucket.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Emoji flag from an ISO 3166-1 alpha-2 code
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map(char => 0x1f1e6 + char.charCodeAt(0) - 65));
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
