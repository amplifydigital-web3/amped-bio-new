import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsTimeseriesPoint } from "./format";
import { SERIES_COLORS, formatBucketLabel, formatNumber } from "./format";

type SeriesKey = "views" | "visitors" | "clicks";

const SERIES_LABELS: Record<SeriesKey, string> = {
  views: "Views",
  visitors: "Unique visitors",
  clicks: "Link clicks",
};

export function TrendChart({
  data,
  bucket,
  series = ["views", "clicks"],
  height = 260,
}: {
  data: AnalyticsTimeseriesPoint[];
  bucket: "hour" | "day";
  series?: SeriesKey[];
  height?: number;
}) {
  const chartData = data.map(point => ({
    ...point,
    label: formatBucketLabel(point.bucket, bucket),
  }));

  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-3" aria-hidden>
        {series.map(key => (
          <span key={key} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="w-3 h-0.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[key] }}
            />
            {SERIES_LABELS[key]}
          </span>
        ))}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="#eceae6" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#d6d4ce" }}
              tick={{ fontSize: 11, fill: "#6b6a65" }}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#6b6a65" }}
              tickFormatter={formatNumber}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "#b8b6ae", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e5e5e5",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
              formatter={(value: number, name: string) => [
                formatNumber(value),
                SERIES_LABELS[name as SeriesKey] ?? name,
              ]}
            />
            {series.map(key => (
              <Line
                key={key}
                type="linear"
                dataKey={key}
                stroke={SERIES_COLORS[key]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="text-xs text-gray-500 cursor-pointer select-none">
          Show as table
        </summary>
        <div className="max-h-48 overflow-y-auto mt-2">
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="text-left font-medium py-1">Period</th>
                {series.map(key => (
                  <th key={key} className="text-right font-medium py-1">
                    {SERIES_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-800 tabular-nums">
              {chartData
                .slice()
                .reverse()
                .map(point => (
                  <tr key={point.bucket} className="border-t border-gray-100">
                    <td className="py-1">{point.bucket}</td>
                    {series.map(key => (
                      <td key={key} className="text-right py-1">
                        {point[key].toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
