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

// Screen Review 093 D3: the Prism v1.1 data palette, built from existing
// tokens. Series 1 is a solid indigo line, series 2 a dashed create ink line,
// so the two read apart in grayscale. The sequential ramp is indigo at five
// alphas over white; text stays ink up to 0.62 and turns white on 0.85.
export const DATA_PALETTE = {
  series1: "#5650A2",
  series2: "#0B5A80",
  series2Dash: "5 3",
  grid: "rgba(22,21,43,0.10)",
  crosshair: "rgba(22,21,43,0.18)",
  axis: "#3A3858",
  bar: "rgba(86,80,162,0.14)",
} as const;

export const RAMP_ALPHAS = [0.1, 0.24, 0.42, 0.62, 0.85] as const;

export function rampColor(step: number) {
  return `rgba(86,80,162,${RAMP_ALPHAS[step]})`;
}

/** Step 0 to 4 for a value against the largest one, or null for zero. */
export function rampStep(value: number, max: number): number | null {
  if (value <= 0 || max <= 0) return null;
  return Math.min(RAMP_ALPHAS.length - 1, Math.floor((value / max) * RAMP_ALPHAS.length));
}

/** Cell text on a ramp step: ink up to 0.62, white only on the top step (4.81:1). */
export function rampText(step: number | null) {
  return step === RAMP_ALPHAS.length - 1 ? "#FFFFFF" : "#16152B";
}

export const RANGE_LABELS: Record<AnalyticsRangePreset, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
  all: "All time",
};

// Freshness line: "Last 28 days compared with the previous 28 days." (093 I05)
export const RANGE_COMPARISON: Record<AnalyticsRangePreset, string | null> = {
  "24h": "the previous 24 hours",
  "7d": "the previous 7 days",
  "28d": "the previous 28 days",
  "90d": "the previous 90 days",
  "365d": "the previous 12 months",
  all: null,
};

export function isRangePreset(value: string | null): value is AnalyticsRangePreset {
  return value !== null && value in RANGE_LABELS;
}

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

/** "just now", "4 min ago", then "2 hours ago" (093 I05). */
export function updatedAgo(date: Date | string | number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
