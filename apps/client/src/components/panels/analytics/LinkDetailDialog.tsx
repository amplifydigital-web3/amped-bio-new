import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  trpc,
} from "@repo/ui";
import type { AnalyticsRangePreset } from "@repo/constants";
import { ExternalLink } from "lucide-react";
import { BreakdownCard } from "./BreakdownCard";
import { TrendChart } from "./TrendChart";
import type { AnalyticsLink } from "./format";
import { RANGE_LABELS, formatNumber, formatPercent } from "./format";

export function LinkDetailDialog({
  link,
  range,
  tzOffsetMinutes,
  onClose,
}: {
  link: AnalyticsLink | null;
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    ...trpc.analytics.linkDetail.queryOptions({
      range,
      tzOffsetMinutes,
      blockId: link?.blockId ?? 1,
    }),
    enabled: !!link,
  });

  return (
    <Dialog open={!!link} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
        {link && (
          <>
            <DialogHeader>
              <DialogTitle>{link.label}</DialogTitle>
              <DialogDescription className="flex items-center gap-1 break-all">
                {link.url && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {link.url}
                    <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                  </a>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-2">
              {[
                { label: "Clicks", value: formatNumber(data?.summary.clicks ?? link.clicks) },
                {
                  label: "Unique clickers",
                  value: formatNumber(data?.summary.clickers ?? link.uniqueClicks),
                },
                {
                  label: "Visitor click-through",
                  value: data ? formatPercent(data.summary.visitorCtr) : "–",
                },
                { label: "Clicks per view", value: formatPercent(data?.summary.ctr ?? link.ctr) },
              ].map(stat => (
                <div key={stat.label} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">{stat.label}</div>
                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              {RANGE_LABELS[range]} · {formatNumber(link.lifetimeClicks)} clicks all time
            </p>

            {isLoading || !data ? (
              <div className="h-56 bg-gray-100 rounded animate-pulse" />
            ) : (
              <TrendChart
                data={data.timeseries}
                bucket={data.bucket}
                series={["clicks"]}
                height={200}
              />
            )}

            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <BreakdownCard
                title="Where clicks came from"
                tabs={[
                  { dimension: "source", label: "Source" },
                  { dimension: "referrer", label: "Referrer" },
                  { dimension: "utm_campaign", label: "Campaign" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
                blockId={link.blockId}
              />
              <BreakdownCard
                title="Who clicked"
                tabs={[
                  { dimension: "country", label: "Country" },
                  { dimension: "city", label: "City" },
                  { dimension: "device", label: "Device" },
                ]}
                range={range}
                tzOffsetMinutes={tzOffsetMinutes}
                blockId={link.blockId}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
