import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, trpc } from "@repo/ui";
import type { AnalyticsRangePreset } from "@repo/constants";
import { Info, Lightbulb, Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { AnalyticsCard } from "./AnalyticsCard";
import { AI_SUMMARY_DISCLOSURE, DEFINITIONS, SOURCES } from "./definitions";
import type { AnalyticsInsight } from "./format";
import { updatedAgo } from "./format";

const FINDINGS_AT_REST = 3;

// 093 I23: each finding names its tone in visible text, never color alone
const TONES: Record<
  AnalyticsInsight["tone"],
  { icon: React.ElementType; iconClass: string; label: string }
> = {
  positive: { icon: TrendingUp, iconClass: "text-prism-success", label: "Positive" },
  negative: { icon: TrendingDown, iconClass: "text-prism-danger", label: "Needs attention" },
  action: { icon: Lightbulb, iconClass: "text-prism-nav", label: "Suggested action" },
  neutral: { icon: Info, iconClass: "text-prism-ink-2", label: "Observation" },
};

/**
 * Screen Review 093 D1: the AI summary is written only when the creator taps
 * Write summary, under the approved disclosure, and cached per range. Nothing
 * is sent to the AI provider before that tap.
 */
function AiSummary({
  range,
  tzOffsetMinutes,
}: {
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
}) {
  // Ranges the creator asked for in this visit; the server caches each for 6 hours
  const [requested, setRequested] = useState<Set<AnalyticsRangePreset>>(() => new Set());
  const asked = requested.has(range);
  const { data, isFetching, isError, refetch } = useQuery({
    ...trpc.analytics.aiSummary.queryOptions({ range, tzOffsetMinutes }),
    enabled: asked,
    staleTime: 30 * 60_000,
    retry: false,
  });

  // No model configured on this server: no summary slot at all
  if (asked && data && !data.enabled) return null;

  const slab = "prism-slab !rounded-prism-21 px-[21px] py-[13px]";
  const heading = (
    <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <Sparkles aria-hidden className="h-[21px] w-[21px] text-prism-nav" />
      AI summary
    </p>
  );

  if (!asked) {
    return (
      <div className={slab}>
        {heading}
        <Button
          variant="secondary"
          className="mt-[13px]"
          onClick={() => setRequested(current => new Set(current).add(range))}
        >
          <Sparkles aria-hidden />
          Write summary
        </Button>
        <p className="mt-[13px] text-prism-meta text-prism-ink-2">{AI_SUMMARY_DISCLOSURE}</p>
      </div>
    );
  }

  if (isFetching && !data) {
    return (
      <div className={slab} aria-live="polite">
        {heading}
        <p className="mt-2 inline-flex items-center gap-2 text-prism-body text-prism-ink-2">
          <Loader2 aria-hidden className="h-[21px] w-[21px] motion-safe:animate-spin" />
          Writing summary
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={slab} role="alert">
        {heading}
        <p className="mt-2 text-prism-body text-prism-ink-2">The summary could not be written.</p>
        <Button variant="secondary" className="mt-[13px]" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data?.text) {
    return (
      <div className={slab}>
        {heading}
        <p className="mt-2 text-prism-body text-prism-ink-2">
          No summary yet. Your page has no views in this period.
        </p>
      </div>
    );
  }

  return (
    <div className={slab} aria-live="polite">
      {heading}
      <p className="mt-2 whitespace-pre-line text-prism-body text-prism-ink">{data.text}</p>
      {data.generatedAt && (
        <p className="mt-2 text-prism-meta text-prism-ink-2">
          Written {updatedAgo(data.generatedAt)} from your totals
        </p>
      )}
    </div>
  );
}

/** Screen Review 093 I23: the AI summary slot, then rule findings as G0 rows. */
export function InsightsCard({
  insights,
  range,
  tzOffsetMinutes,
  className,
}: {
  insights: AnalyticsInsight[];
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? insights : insights.slice(0, FINDINGS_AT_REST);

  return (
    <AnalyticsCard
      id="insights"
      title="Insights"
      description="Findings from your numbers for this period."
      info={DEFINITIONS.insights}
      source={SOURCES.rules}
      className={className}
    >
      <AiSummary range={range} tzOffsetMinutes={tzOffsetMinutes} />

      {insights.length === 0 ? (
        <p className="mt-[21px] text-prism-body text-prism-ink-2">
          Not enough activity yet for insights.
        </p>
      ) : (
        <ul className="mt-[13px] divide-y divide-prism-line">
          {shown.map(insight => {
            const tone = TONES[insight.tone];
            return (
              <li key={insight.id} className="flex gap-[13px] py-[13px]">
                <span className="prism-disc !h-[34px] !w-[34px] shrink-0" aria-hidden>
                  <tone.icon className={`h-[21px] w-[21px] ${tone.iconClass}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-prism-meta text-prism-ink-2">{tone.label}</p>
                  <p className="text-prism-label font-semibold text-prism-ink">{insight.title}</p>
                  <p className="mt-1 text-prism-body text-prism-ink-2">{insight.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {insights.length > FINDINGS_AT_REST && (
        <Button variant="ghost" aria-expanded={showAll} onClick={() => setShowAll(open => !open)}>
          {showAll ? "Show fewer findings" : `Show all ${insights.length} findings`}
        </Button>
      )}
    </AnalyticsCard>
  );
}
