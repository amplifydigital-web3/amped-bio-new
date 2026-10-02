import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { Button } from "@repo/ui";
import type { AnalyticsTimeseriesPoint } from "./format";
import { DATA_PALETTE, formatBucketLabel, formatNumber } from "./format";

type SeriesKey = "views" | "visitors" | "clicks";

const SERIES_LABELS: Record<SeriesKey, string> = {
  views: "Views",
  visitors: "Visitors",
  clicks: "Link clicks",
};

const SPOKEN: Record<SeriesKey, string> = {
  views: "views",
  visitors: "visitors",
  clicks: "link clicks",
};

// 093 D3: the first series is the solid indigo line, the second the dashed one
function seriesStyle(index: number) {
  return index === 0
    ? { stroke: DATA_PALETTE.series1, strokeDasharray: undefined }
    : { stroke: DATA_PALETTE.series2, strokeDasharray: DATA_PALETTE.series2Dash };
}

type ChartPoint = AnalyticsTimeseriesPoint & { label: string };

function LineSample({ index }: { index: number }) {
  const { stroke, strokeDasharray } = seriesStyle(index);
  return (
    <svg width="21" height="8" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="21"
        y2="4"
        stroke={stroke}
        strokeWidth="2"
        strokeDasharray={strokeDasharray}
      />
    </svg>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: TooltipProps<number, string> & { series: SeriesKey[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  return (
    <div className="prism-raised rounded-prism-13 px-[13px] py-2 font-prism">
      <p className="text-prism-meta font-bold text-prism-ink">{label}</p>
      {series.map(key => (
        <p key={key} className="text-prism-meta tabular-nums text-prism-ink">
          {SERIES_LABELS[key]}: {formatNumber(point?.[key] ?? 0)}
        </p>
      ))}
    </div>
  );
}

/**
 * Screen Review 093 I17: a G2 slab plot with the D3 series, a legend above,
 * a crosshair tooltip on hover, and keyboard reading: the plot takes focus and
 * Left and Right move between buckets, announced politely. Show as table opens
 * the same numbers with formatted dates.
 */
export function TrendChart({
  data,
  bucket,
  series = ["views", "clicks"],
  // Slab height: a 233 plot plus 13 padding above and below
  height = 259,
  label = "Activity chart",
}: {
  data: AnalyticsTimeseriesPoint[];
  bucket: "hour" | "day";
  series?: SeriesKey[];
  height?: number;
  label?: string;
}) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const chartData: ChartPoint[] = data.map(point => ({
    ...point,
    label: formatBucketLabel(point.bucket, bucket),
  }));

  const focused = focusIndex !== null ? chartData[focusIndex] : null;
  const announcement = focused
    ? `${focused.label}: ${series.map(key => `${formatNumber(focused[key])} ${SPOKEN[key]}`).join(", ")}`
    : "";

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (chartData.length === 0) return;
    const last = chartData.length - 1;
    const current = focusIndex ?? last;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(last, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setFocusIndex(next);
  };

  return (
    <div className="font-prism">
      <div className="mb-[13px] flex flex-wrap items-center gap-x-[21px] gap-y-2">
        {series.map((key, index) => (
          <span
            key={key}
            className="inline-flex items-center gap-2 text-prism-meta text-prism-ink-2"
          >
            <LineSample index={index} />
            {SERIES_LABELS[key]}
          </span>
        ))}
      </div>
      <div
        role="group"
        tabIndex={0}
        aria-label={`${label}. Use the left and right arrow keys to read each ${bucket === "hour" ? "hour" : "day"}.`}
        onKeyDown={onKeyDown}
        onFocus={() => setFocusIndex(current => current ?? Math.max(0, chartData.length - 1))}
        onBlur={() => setFocusIndex(null)}
        className="prism-slab prism-focus relative p-[13px]"
        style={{ height }}
      >
        {focused && (
          <div className="prism-raised pointer-events-none absolute right-[13px] top-[13px] z-10 rounded-prism-13 px-[13px] py-2">
            <p className="text-prism-meta font-bold text-prism-ink">{focused.label}</p>
            {series.map(key => (
              <p key={key} className="text-prism-meta tabular-nums text-prism-ink">
                {SERIES_LABELS[key]}: {formatNumber(focused[key])}
              </p>
            ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={DATA_PALETTE.grid} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: DATA_PALETTE.grid }}
              tick={{ fontSize: 13, fill: DATA_PALETTE.axis }}
              minTickGap={34}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 13, fill: DATA_PALETTE.axis }}
              tickFormatter={formatNumber}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: DATA_PALETTE.crosshair, strokeWidth: 1 }}
              content={<ChartTooltip series={series} />}
              isAnimationActive={false}
            />
            {focused && (
              <ReferenceLine x={focused.label} stroke={DATA_PALETTE.crosshair} strokeWidth={1} />
            )}
            {series.map((key, index) => {
              const style = seriesStyle(index);
              return (
                <Line
                  key={key}
                  type="linear"
                  dataKey={key}
                  name={SERIES_LABELS[key]}
                  stroke={style.stroke}
                  strokeDasharray={style.strokeDasharray}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "#FFFFFF" }}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <Button
        variant="ghost"
        className="mt-[13px]"
        aria-expanded={showTable}
        onClick={() => setShowTable(open => !open)}
      >
        {showTable ? "Hide table" : "Show as table"}
      </Button>
      {showTable && (
        <div className="prism-slab relative mt-2 max-h-[377px] overflow-y-auto px-[13px]">
          <table className="w-full text-left">
            <caption className="sr-only">{label} as a table</caption>
            <thead>
              <tr className="text-prism-meta text-prism-ink-2">
                <th scope="col" className="h-touch font-normal">
                  {bucket === "hour" ? "Hour" : "Day"}
                </th>
                {series.map(key => (
                  <th key={key} scope="col" className="h-touch text-right font-normal">
                    {SERIES_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums text-prism-label text-prism-ink">
              {chartData
                .slice()
                .reverse()
                .map(point => (
                  <tr key={point.bucket} className="border-t border-prism-line">
                    <th scope="row" className="h-touch font-normal">
                      {point.label}
                    </th>
                    {series.map(key => (
                      <td key={key} className="h-touch text-right">
                        {point[key].toLocaleString("en-US")}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
