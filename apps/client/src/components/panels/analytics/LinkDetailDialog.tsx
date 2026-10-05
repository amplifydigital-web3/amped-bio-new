import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  trpc,
} from "@repo/ui";
import type { AnalyticsRangePreset } from "@repo/constants";
import { ExternalLink, Pencil } from "lucide-react";
import { Eyebrow } from "./AnalyticsCard";
import { BreakdownList } from "./BreakdownCard";
import { TrendChart } from "./TrendChart";
import type { AnalyticsLink } from "./format";
import { RANGE_LABELS, formatNumber, formatPercent } from "./format";
import { SkeletonBlock, useShowAfter } from "./Skeleton";

/**
 * Screen Review 093 I24 to I26: link detail in the shared Dialog (a bottom
 * sheet at 390). URL as a ghost link, a 2 by 2 stat grid, the clicks chart,
 * both breakdowns stacked, a local error card with Retry, and Edit this link.
 */
export function LinkDetailDialog({
  link,
  range,
  tzOffsetMinutes,
  onClose,
  onEdit,
  returnFocusTo,
}: {
  link: AnalyticsLink | null;
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  onClose: () => void;
  onEdit: (blockId: number) => void;
  // 093 I20: focus goes back to the row that opened the dialog
  returnFocusTo?: HTMLElement | null;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    ...trpc.analytics.linkDetail.queryOptions({
      range,
      tzOffsetMinutes,
      blockId: link?.blockId ?? 1,
    }),
    enabled: !!link,
  });
  const skeleton = useShowAfter(isLoading);
  // Kept after close, when the parent has already cleared the selection
  const focusTarget = useRef<HTMLElement | null>(null);
  if (returnFocusTo) focusTarget.current = returnFocusTo;

  const stats = link
    ? [
        { label: "Clicks", value: formatNumber(data?.summary.clicks ?? link.clicks) },
        {
          label: "Unique clickers",
          value: formatNumber(data?.summary.clickers ?? link.uniqueClicks),
        },
        {
          label: "Click-through",
          value: data ? formatPercent(data.summary.visitorCtr) : "No data",
        },
        { label: "Click rate", value: formatPercent(data?.summary.ctr ?? link.ctr) },
      ]
    : [];

  return (
    <Dialog open={!!link} onOpenChange={open => !open && onClose()}>
      <DialogContent
        className="max-w-[508px] gap-[21px]"
        onCloseAutoFocus={event => {
          if (focusTarget.current?.isConnected) {
            event.preventDefault();
            focusTarget.current.focus();
          }
        }}
      >
        {link && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words text-prism-panel-title">{link.label}</DialogTitle>
              {link.url ? (
                <DialogDescription asChild>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="prism-focus inline-flex min-h-touch items-center gap-2 break-all rounded-prism-8 text-prism-label font-semibold text-prism-nav hover:underline"
                  >
                    <span className="min-w-0 truncate">{link.url}</span>
                    <ExternalLink aria-hidden className="h-[21px] w-[21px] shrink-0" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Link details</DialogDescription>
              )}
            </DialogHeader>

            <div>
              <dl className="grid grid-cols-2 gap-[13px]">
                {stats.map(stat => (
                  <div key={stat.label} className="prism-slab !rounded-prism-13 p-[13px]">
                    <dt className="text-prism-meta text-prism-ink-2">{stat.label}</dt>
                    <dd className="text-prism-panel-title tabular-nums text-prism-ink">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-prism-meta text-prism-ink-2">
                {RANGE_LABELS[range]}. {formatNumber(link.lifetimeClicks)} clicks all time.
              </p>
            </div>

            {isError ? (
              <ErrorCard
                title="This link's details did not load"
                onRetry={() => void refetch()}
                retryLabel="Retry"
              />
            ) : isLoading || !data ? (
              skeleton ? (
                <SkeletonBlock className="h-[170px]" />
              ) : (
                <div className="h-[170px]" />
              )
            ) : (
              <TrendChart
                data={data.timeseries}
                bucket={data.bucket}
                series={["clicks"]}
                height={170}
                label="Clicks on this link"
              />
            )}

            <section>
              <Eyebrow>Where clicks came from</Eyebrow>
              <div className="mt-[13px]">
                <BreakdownList
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
              </div>
            </section>
            <section>
              <Eyebrow>Who clicked</Eyebrow>
              <div className="mt-[13px]">
                <BreakdownList
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
            </section>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onEdit(link.blockId)}>
                <Pencil aria-hidden />
                Edit this link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
