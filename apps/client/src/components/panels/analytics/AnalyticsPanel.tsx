import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Button, ErrorCard, Tabs, TabsContent, TabsList, TabsTrigger, trpc } from "@repo/ui";
import type { AnalyticsRangePreset } from "@repo/constants";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useEditor } from "@/contexts/EditorContext";
import { useDestinationTab } from "@/hooks/useDestinationTab";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { requestAddBlock } from "@/components/preview/addBlockRequest";
import { publicPageAddress, publicPageUrl } from "@/components/shell/pageLink";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { AnalyticsCard } from "./AnalyticsCard";
import { ExportMenu, RangeSelect } from "./AnalyticsHeader";
import { BreakdownCard } from "./BreakdownCard";
import { CampaignsCard } from "./CampaignsCard";
import {
  DEFINITIONS,
  PRIVACY_FOOTER,
  PRIVACY_STEPS,
  PRIVACY_STEP_SERVER_TOKEN,
  SOURCES,
} from "./definitions";
import { GettingStartedCard } from "./GettingStartedCard";
import { HowTo } from "./HowTo";
import { InsightsCard } from "./InsightsCard";
import { KpiTiles } from "./KpiTiles";
import { LinkDetailDialog } from "./LinkDetailDialog";
import { RealtimeCard } from "./RealtimeCard";
import { RetentionCard } from "./RetentionCard";
import { SkeletonBlock, useShowAfter } from "./Skeleton";
import { TopLinksTable } from "./TopLinksTable";
import { TrackingPixelsCard } from "./TrackingPixelsCard";
import { TrendChart } from "./TrendChart";
import type { AnalyticsLink } from "./format";
import {
  RANGE_COMPARISON,
  RANGE_LABELS,
  getTzOffsetMinutes,
  isRangePreset,
  updatedAgo,
} from "./format";

const TABS = ["overview", "audience", "campaigns"] as const;
type AnalyticsTab = (typeof TABS)[number];

// Getting started jumps land on a section in its own tab (093 I01, I11)
const SECTION_TAB: Record<string, AnalyticsTab> = {
  campaigns: "campaigns",
  pixels: "campaigns",
  insights: "overview",
};

const MORE_METRICS_KEY = "amped_analytics_more_metrics";

function readMoreMetrics() {
  try {
    return window.localStorage.getItem(MORE_METRICS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMoreMetrics(open: boolean) {
  try {
    if (open) window.localStorage.setItem(MORE_METRICS_KEY, "1");
    else window.localStorage.removeItem(MORE_METRICS_KEY);
  } catch {
    // The choice still applies for this visit
  }
}

/** 093 I07: the period lives in ?range=, default Last 28 days. */
function useRangeParam() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("range");
  const range: AnalyticsRangePreset = isRangePreset(raw) ? raw : "28d";
  const setRange = useCallback(
    (next: AnalyticsRangePreset) =>
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          if (next === "28d") updated.delete("range");
          else updated.set("range", next);
          return updated;
        },
        { replace: true }
      ),
    [setParams]
  );
  return [range, setRange] as const;
}

/** 093 I05, I06: one freshness line per tab, with the public page as a ghost link. */
function Freshness({
  range,
  updatedAt,
  handle,
  action,
}: {
  range: AnalyticsRangePreset;
  updatedAt?: Date | string | null;
  handle: string;
  action?: React.ReactNode;
}) {
  const comparison = RANGE_COMPARISON[range];
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(tick => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex min-h-touch flex-wrap items-center justify-between gap-x-[13px] gap-y-1">
      <p className="flex flex-wrap items-center gap-x-2 text-prism-meta text-prism-ink-2">
        <span>
          {comparison
            ? `${RANGE_LABELS[range]} compared with ${comparison}.`
            : `${RANGE_LABELS[range]}.`}
          {updatedAt ? ` Updated ${updatedAgo(updatedAt)}.` : ""}
        </span>
        <a
          href={publicPageUrl(handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus inline-flex min-h-touch items-center gap-1 rounded-prism-8 font-semibold text-prism-nav hover:underline"
        >
          {publicPageAddress(handle)}
          <ExternalLink aria-hidden className="h-[13px] w-[13px]" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
      {action}
    </div>
  );
}

/** 093 I42: the privacy footer, verbatim, at the bottom of every tab. */
function PrivacyFooter() {
  return (
    <p className="flex items-start gap-2 pb-2 text-prism-meta text-prism-ink-2">
      <ShieldCheck aria-hidden className="h-[21px] w-[21px] shrink-0" />
      {PRIVACY_FOOTER}
    </p>
  );
}

function PrivacyHowTo({ hasServerToken }: { hasServerToken: boolean }) {
  return (
    <HowTo
      storageKey="privacy"
      title="How visitor privacy works on your page"
      steps={hasServerToken ? [...PRIVACY_STEPS, PRIVACY_STEP_SERVER_TOKEN] : PRIVACY_STEPS}
    />
  );
}

/** 093 I09: skeletons that match each tab, shown after 400ms. */
function TabSkeleton({ tab }: { tab: AnalyticsTab }) {
  const shown = useShowAfter(true);
  if (!shown) return <div aria-busy className="min-h-[377px]" />;
  if (tab === "overview") {
    return (
      <div aria-busy aria-label="Loading analytics" className="space-y-[21px]">
        <div className="grid grid-cols-2 gap-[13px] md:grid-cols-4 md:gap-[21px]">
          {[0, 1, 2, 3].map(index => (
            <SkeletonBlock key={index} className="h-[127px]" />
          ))}
        </div>
        <div className="grid gap-[13px] xl:grid-cols-[minmax(0,1fr)_508px] xl:gap-[21px]">
          <SkeletonBlock className="h-[377px]" />
          <SkeletonBlock className="h-[377px]" />
        </div>
      </div>
    );
  }
  return (
    <div
      aria-busy
      aria-label="Loading analytics"
      className="grid gap-[13px] xl:grid-cols-2 xl:gap-[21px]"
    >
      {[0, 1, 2, 3].map(index => (
        <SkeletonBlock key={index} className="h-[377px]" />
      ))}
    </div>
  );
}

/**
 * Screen Review 093: Analytics as three tabs, Overview | Audience | Campaigns,
 * on the full width grid. The range select and Export sit in the header row
 * and stay usable while a tab loads or fails.
 */
export function AnalyticsPanel() {
  const { profile, setActivePanelAndNavigate, selectBlock } = useEditor();
  const mobile = useMediaQuery(PHONE_QUERY);
  const [tab, setTab] = useDestinationTab(TABS);
  const [range, setRange] = useRangeParam();
  const [selected, setSelected] = useState<{ link: AnalyticsLink; trigger: HTMLElement } | null>(
    null
  );
  const [moreMetrics, setMoreMetrics] = useState(readMoreMetrics);
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
  const hasServerToken = !!(pixelData?.hasMetaCapiToken || pixelData?.hasTiktokEventsToken);

  const goTo = (sectionId: string) => {
    const target = SECTION_TAB[sectionId] ?? "overview";
    if (target !== tab) setTab(target);
    // Wait for the tab to render, then bring the section into view and focus it
    setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!section.hasAttribute("tabindex")) section.setAttribute("tabindex", "-1");
      section.focus({ preventScroll: true });
    }, 50);
  };

  const toggleMoreMetrics = () => {
    setMoreMetrics(open => {
      writeMoreMetrics(!open);
      return !open;
    });
  };

  // 093 I22, D18: Add a link opens Page with the Add block dialog
  const addLink = () => {
    setActivePanelAndNavigate("page");
    requestAddBlock();
  };

  // 093 I26, D18: Edit this link opens Page with that block's row open
  const editLink = (blockId: number) => {
    setSelected(null);
    selectBlock(blockId);
    setActivePanelAndNavigate("page");
  };

  const updatedAt = data?.meta.generatedAt;
  const failed = isError || (!isLoading && !data);
  const errorCard = (
    <ErrorCard
      title="Analytics did not load"
      cause="We could not reach the analytics service. Your data is safe."
      onRetry={() => void refetch()}
      retryLabel="Retry"
    />
  );

  return (
    <div className="min-h-full font-prism">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
        {/* 093 I01 to I03: tabs left, period and Export right; one row at 1440 */}
        <div className="flex flex-col gap-[13px] px-[13px] pt-5 md:flex-row md:items-center md:px-6">
          <TabsList aria-label="Analytics sections" className="w-full md:w-auto">
            <TabsTrigger value="overview" className="flex-1 px-4 md:flex-none md:px-5">
              Overview
            </TabsTrigger>
            <TabsTrigger value="audience" className="flex-1 px-4 md:flex-none md:px-5">
              Audience
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex-1 px-4 md:flex-none md:px-5">
              Campaigns
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-[13px] md:ml-auto">
            <RangeSelect range={range} onChange={setRange} className="flex-1 md:flex-none" />
            <ExportMenu
              range={range}
              tzOffsetMinutes={tzOffsetMinutes}
              handle={profile.handle}
              compact={mobile}
            />
          </div>
        </div>

        <div className="px-[13px] pb-[calc(89px+env(safe-area-inset-bottom,0px))] md:px-6 md:pb-[55px]">
          <TabsContent value="overview" className="mt-[21px] space-y-[13px] md:space-y-[21px]">
            {isLoading ? (
              <TabSkeleton tab="overview" />
            ) : failed || !data ? (
              errorCard
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
                  showMore={moreMetrics}
                />

                <Freshness
                  range={range}
                  updatedAt={updatedAt}
                  handle={profile.handle}
                  action={
                    <Button
                      variant="ghost"
                      aria-expanded={moreMetrics}
                      aria-controls="more-metrics"
                      onClick={toggleMoreMetrics}
                    >
                      {moreMetrics ? "Hide 4 more metrics" : "Show 4 more metrics"}
                    </Button>
                  }
                />

                {/* 1440: Activity then Links left of the golden line, Insights then
                    Live right of it. 390: Insights, Activity, Links, Live. */}
                <div className="flex flex-col gap-[13px] xl:grid xl:grid-cols-[minmax(0,1fr)_508px] xl:items-start xl:gap-[21px]">
                  <div className="contents xl:flex xl:flex-col xl:gap-[21px]">
                    <AnalyticsCard
                      id="activity"
                      title="Activity"
                      description={
                        data.range.bucket === "hour"
                          ? "Hourly, in your local time"
                          : "Daily, in your local time"
                      }
                      info={DEFINITIONS.activity}
                      source={SOURCES.pageEvents}
                      className="order-2 xl:order-none"
                    >
                      <TrendChart data={data.timeseries} bucket={data.range.bucket} />
                    </AnalyticsCard>
                    <AnalyticsCard
                      id="links"
                      title="Links"
                      description="Select a link for its sources, locations and trend."
                      info={DEFINITIONS.links}
                      source={SOURCES.pageEvents}
                      className="order-3 xl:order-none"
                    >
                      <TopLinksTable
                        links={data.links}
                        onSelect={(link, trigger) => setSelected({ link, trigger })}
                        onAddLink={addLink}
                      />
                    </AnalyticsCard>
                  </div>
                  <div className="contents xl:flex xl:flex-col xl:gap-[21px]">
                    <InsightsCard
                      insights={data.insights}
                      range={range}
                      tzOffsetMinutes={tzOffsetMinutes}
                      className="order-1 xl:order-none"
                    />
                    <RealtimeCard handle={profile.handle} className="order-4 xl:order-none" />
                  </div>
                </div>

                <PrivacyHowTo hasServerToken={hasServerToken} />
                <PrivacyFooter />
              </>
            )}
          </TabsContent>

          <TabsContent value="audience" className="mt-[13px] space-y-[13px] md:space-y-[21px]">
            <Freshness range={range} updatedAt={updatedAt} handle={profile.handle} />
            {isLoading ? (
              <TabSkeleton tab="audience" />
            ) : failed || !data ? (
              errorCard
            ) : (
              <>
                <div className="flex flex-col gap-[13px] xl:grid xl:grid-cols-[minmax(0,1fr)_508px] xl:items-start xl:gap-[21px]">
                  <div className="contents xl:flex xl:flex-col xl:gap-[21px]">
                    <BreakdownCard
                      id="sources"
                      title="Traffic sources"
                      description="Where visitors came from"
                      info={DEFINITIONS.sources}
                      tabs={[
                        { dimension: "source", label: "Source" },
                        { dimension: "referrer", label: "Referrer" },
                      ]}
                      range={range}
                      tzOffsetMinutes={tzOffsetMinutes}
                      className="order-1 xl:order-none"
                    />
                    <BreakdownCard
                      id="technology"
                      title="Technology"
                      info={DEFINITIONS.technology}
                      tabs={[
                        { dimension: "device", label: "Device" },
                        { dimension: "browser", label: "Browser or app" },
                        { dimension: "os", label: "OS" },
                      ]}
                      range={range}
                      tzOffsetMinutes={tzOffsetMinutes}
                      className="order-3 xl:order-none"
                    />
                  </div>
                  <div className="contents xl:flex xl:flex-col">
                    <BreakdownCard
                      id="locations"
                      title="Locations"
                      info={DEFINITIONS.locations}
                      tabs={[
                        { dimension: "country", label: "Country" },
                        { dimension: "city", label: "City" },
                      ]}
                      range={range}
                      tzOffsetMinutes={tzOffsetMinutes}
                      className="order-2 xl:order-none"
                    />
                  </div>
                </div>
                <AnalyticsCard
                  id="heatmap"
                  title="When people visit"
                  description="Views by weekday and hour, local time"
                  info={DEFINITIONS.heatmap}
                  source={SOURCES.pageEvents}
                >
                  <ActivityHeatmap cells={data.heatmap} />
                </AnalyticsCard>
                <RetentionCard tzOffsetMinutes={tzOffsetMinutes} />
                <PrivacyFooter />
              </>
            )}
          </TabsContent>

          <TabsContent value="campaigns" className="mt-[13px] space-y-[13px] md:space-y-[21px]">
            <Freshness range={range} updatedAt={updatedAt} handle={profile.handle} />
            <CampaignsCard
              handle={profile.handle}
              range={range}
              tzOffsetMinutes={tzOffsetMinutes}
            />
            <BreakdownCard
              id="link-tags"
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
            <TrackingPixelsCard />
            <PrivacyHowTo hasServerToken={hasServerToken} />
            <PrivacyFooter />
          </TabsContent>
        </div>
      </Tabs>

      <LinkDetailDialog
        link={selected?.link ?? null}
        range={range}
        tzOffsetMinutes={tzOffsetMinutes}
        onClose={() => setSelected(null)}
        onEdit={editLink}
        returnFocusTo={selected?.trigger}
      />
    </div>
  );
}
