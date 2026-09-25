import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { trpc } from "@repo/ui";
import type { AnalyticsRangePreset } from "@repo/constants";
import { Lightbulb, Sparkles, TrendingDown, TrendingUp, Info } from "lucide-react";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { RANGE_LABELS } from "./format";
import type { AnalyticsInsight } from "./format";

const TONE_STYLES: Record<
  AnalyticsInsight["tone"],
  { icon: React.ElementType; className: string; label: string }
> = {
  positive: { icon: TrendingUp, className: "text-emerald-700 bg-emerald-50", label: "Positive" },
  negative: { icon: TrendingDown, className: "text-red-700 bg-red-50", label: "Needs attention" },
  action: { icon: Lightbulb, className: "text-amber-700 bg-amber-50", label: "Suggested action" },
  neutral: { icon: Info, className: "text-blue-700 bg-blue-50", label: "Observation" },
};

export function InsightsCard({
  insights,
  range,
  tzOffsetMinutes,
  updatedAt,
}: {
  updatedAt?: Date | string;
  insights: AnalyticsInsight[];
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
}) {
  const { data: ai, isLoading: aiLoading } = useQuery({
    ...trpc.analytics.aiSummary.queryOptions({ range, tzOffsetMinutes }),
    staleTime: 30 * 60_000,
    retry: false,
  });

  return (
    <AnalyticsCard
      id="insights"
      title="Insights"
      description="Generated from your numbers for this period."
      info={DEFINITIONS.insights}
      source={SOURCES.rules}
      period={RANGE_LABELS[range]}
      updatedAt={updatedAt}
    >
      {aiLoading ? (
        <div className="mb-3 h-16 rounded-lg bg-violet-50 animate-pulse" />
      ) : ai?.enabled && ai.text ? (
        <div className="mb-4 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 mb-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            AI summary
            {ai.generatedAt && (
              <span className="font-normal text-violet-700/80">
                · written from your totals{" "}
                {formatDistanceToNowStrict(new Date(ai.generatedAt), { addSuffix: true })}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{ai.text}</div>
        </div>
      ) : null}

      <ul className="space-y-3">
        {insights.map(insight => {
          const tone = TONE_STYLES[insight.tone];
          return (
            <li key={insight.id} className="flex gap-3">
              <span
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${tone.className}`}
                title={tone.label}
              >
                <tone.icon className="w-4 h-4" aria-label={tone.label} />
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{insight.detail}</p>
              </div>
            </li>
          );
        })}
        {insights.length === 0 && (
          <li className="text-sm text-gray-500">Not enough activity yet for insights.</li>
        )}
      </ul>
    </AnalyticsCard>
  );
}
