import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc, trpcClient } from "@repo/ui";
import { ANALYTICS_RANGE_PRESETS, type AnalyticsRangePreset } from "@repo/constants";
import { AlertCircle, BarChart3, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "react-hot-toast";
import { useEditor } from "@/contexts/EditorContext";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { AnalyticsCard } from "./AnalyticsCard";
import { BreakdownCard } from "./BreakdownCard";
import { CampaignsCard } from "./CampaignsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import { GettingStartedCard } from "./GettingStartedCard";
import { HowTo } from "./HowTo";
import { RetentionCard } from "./RetentionCard";
import { InsightsCard } from "./InsightsCard";
import { KpiTiles } from "./KpiTiles";
import { LinkDetailDialog } from "./LinkDetailDialog";
import { RealtimeCard } from "./RealtimeCard";
import { TopLinksTable } from "./TopLinksTable";
import { TrackingPixelsCard } from "./TrackingPixelsCard";
import { TrendChart } from "./TrendChart";
import type { AnalyticsLink } from "./format";
import { RANGE_LABELS, RANGE_SHORT_LABELS, getTzOffsetMinutes } from "./format";

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse"
          />
        ))}
      </div>
      <div className="h-80 bg-white border border-gray-200 rounded-xl animate-pulse" />
    </div>
  );
}

export function AnalyticsPanel() {
  const { profile } = useEditor();
  const [range, setRange] = useState<AnalyticsRangePreset>("28d");
  const [selectedLink, setSelectedLink] = useState<AnalyticsLink | null>(null);
  const [tzOffsetMinutes] = useState(getTzOffsetMinutes);

  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.analytics.dashboard.queryOptions({ range, tzOffsetMinutes }),
    refetchInterval: 60_000,
  });
  // Shared with the Campaigns and Pixels cards through the query cache
  const { data: campaignData } = useQuery(
    trpc.analytics.campaigns.queryOptions({ range, tzOffsetMinutes })
  );
  const { data: pixelData } = useQuery(trpc.trackingPixels.get.queryOptions());

  const goTo = (sectionId: string) =>
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const period = RANGE_LABELS[range];

  const exportMutation = useMutation({
    mutationFn: () => trpcClient.analytics.exportCsv.mutate({ range, tzOffsetMinutes }),
    onSuccess: result => {
      if (!result) return;
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `amped-bio-analytics-${profile.handle}-${range}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(
        result.truncated
          ? `Exported the first ${result.rowCount.toLocaleString()} events`
          : `Exported ${result.rowCount.toLocaleString()} events`
      );
    },
    onError: () => toast.error("Export failed. Please try again."),
  });

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        {/* Header and filters */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" aria-hidden />
              Analytics
            </h2>
            <p className="text-sm text-gray-500">
              {RANGE_LABELS[range]} for amped.bio/{profile.handle}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              role="radiogroup"
              aria-label="Date range"
              className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5"
            >
              {ANALYTICS_RANGE_PRESETS.map(preset => (
                <button
                  key={preset}
                  role="radio"
                  aria-checked={range === preset}
                  title={RANGE_LABELS[preset]}
                  onClick={() => setRange(preset)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    range === preset ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {RANGE_SHORT_LABELS[preset]}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {exportMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export CSV
            </button>
          </div>
        </div>

        {isLoading ? (
          <DashboardSkeleton />
        ) : isError || !data ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Analytics could not be loaded.
            <button onClick={() => refetch()} className="underline font-medium ml-1">
              Try again
            </button>
          </div>
        ) : (
          <>
            <GettingStartedCard
              handle={profile.handle}
              hasViews={data.summary.views > 0}
              hasCampaign={(campaignData?.campaigns.length ?? 0) > 0}
              hasPixel={
                !!(
                  pixelData?.ga4MeasurementId ||
                  pixelData?.metaPixelId ||
                  pixelData?.tiktokPixelId
                )
              }
              onGoTo={goTo}
            />

            <KpiTiles
              summary={data.summary}
              previous={data.previous}
              audience={data.audience}
              previousAudience={data.previousAudience}
              periodLabel={period}
              updatedAt={data.meta.generatedAt}
            />

            <div className="grid lg:grid-cols-3 gap-4">
              <AnalyticsCard
                title="Activity"
                description={
                  data.range.bucket === "hour"
                    ? "Hourly, in your local time"
                    : "Daily, in your local time"
                }
                info={DEFINITIONS.activity}
                source={SOURCES.pageEvents}
                period={period}
                updatedAt={data.meta.generatedAt}
                className="lg:col-span-2"
              >
                <TrendChart data={data.timeseries} bucket={data.range.bucket} />
              </AnalyticsCard>
              <RealtimeCard />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <AnalyticsCard
                title="Links"
                description="Select a link for its sources, locations and trend."
                info={DEFINITIONS.links}
                source={SOURCES.pageEvents}
                period={period}
                updatedAt={data.meta.generatedAt}
                className="lg:col-span-2"
              >
                <TopLinksTable links={data.links} onSelect={setSelectedLink} />
              </AnalyticsCard>
              <InsightsCard
                insights={data.insights}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
                updatedAt={data.meta.generatedAt}
              />
            </div>

            <RetentionCard
              tzOffsetMinutes={tzOffsetMinutes}
              coverage={
                data.summary.visitors > 0
                  ? data.audience.consentedVisitors / data.summary.visitors
                  : 0
              }
            />

            <CampaignsCard
              handle={profile.handle}
              range={range}
              tzOffsetMinutes={tzOffsetMinutes}
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <BreakdownCard
                title="Traffic sources"
                description="Where visitors came from"
                info={DEFINITIONS.sources}
                tabs={[
                  { dimension: "source", label: "Source" },
                  { dimension: "referrer", label: "Referrer" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
              />
              <BreakdownCard
                title="Link tags"
                description="All tagged links, including ones made outside Amped (UTM)"
                info="Reads utm_campaign, utm_source and utm_medium from the address visitors arrived on. Campaigns you create above appear here too."
                tabs={[
                  { dimension: "utm_campaign", label: "Campaign" },
                  { dimension: "utm_source", label: "UTM source" },
                  { dimension: "utm_medium", label: "UTM medium" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
              />
              <BreakdownCard
                title="Locations"
                info={DEFINITIONS.locations}
                tabs={[
                  { dimension: "country", label: "Country" },
                  { dimension: "city", label: "City" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
              />
              <BreakdownCard
                title="Technology"
                info={DEFINITIONS.technology}
                tabs={[
                  { dimension: "device", label: "Device" },
                  { dimension: "browser", label: "Browser / app" },
                  { dimension: "os", label: "OS" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
              />
              <AnalyticsCard
                title="When people visit"
                description="Views by weekday and hour, local time"
                info={DEFINITIONS.heatmap}
                source={SOURCES.pageEvents}
                period={period}
                updatedAt={data.meta.generatedAt}
                className="md:col-span-2"
              >
                <ActivityHeatmap cells={data.heatmap} />
              </AnalyticsCard>
            </div>

            <TrackingPixelsCard />

            <HowTo
              storageKey="privacy"
              title="How visitor privacy works on your page"
              steps={[
                "Every visit is counted without cookies. Visitors' IP addresses are never stored.",
                "Visitors see a privacy banner with Accept all, Reject all and Choose. Their choice is saved for up to 13 months and can be changed from the Privacy choices link on your page.",
                "Returning visitors and retention only include visitors who allowed return visits, so those numbers show their coverage.",
                "Your pixels load only for visitors who allow ads and analytics. Browsers that send a Global Privacy Control signal are always treated as a no.",
              ]}
            />

            <p className="flex items-start gap-1.5 text-xs text-gray-500 pb-6">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
              Visits are counted without cookies and IP addresses are not stored. Return visits are
              measured only for visitors who opt in. Your own visits while signed in are excluded.
              Location data includes GeoLite2 data created by MaxMind.
            </p>
          </>
        )}
      </div>

      <LinkDetailDialog
        link={selectedLink}
        range={range}
        tzOffsetMinutes={tzOffsetMinutes}
        onClose={() => setSelectedLink(null)}
      />
    </div>
  );
}
