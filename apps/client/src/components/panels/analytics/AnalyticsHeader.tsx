import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ANALYTICS_RANGE_PRESETS, type AnalyticsRangePreset } from "@repo/constants";
import { Button, Menu, MenuContent, MenuItem, MenuTrigger, cn, trpcClient } from "@repo/ui";
import { Check, ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { RANGE_LABELS } from "./format";

/**
 * Screen Review 093 I07: the period as a G2 well select (44, r13, 233 wide on
 * desktop, flex at 390) that opens a raised menu of six radio rows. The
 * choice lives in ?range=.
 */
export function RangeSelect({
  range,
  onChange,
  className,
}: {
  range: AnalyticsRangePreset;
  onChange: (range: AnalyticsRangePreset) => void;
  className?: string;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Period: ${RANGE_LABELS[range]}`}
        className={cn(
          "prism-well prism-focus flex h-touch items-center justify-between gap-2 px-[13px] font-prism text-prism-label text-prism-ink md:w-[233px]",
          className
        )}
      >
        <span className="truncate">{RANGE_LABELS[range]}</span>
        <ChevronDown aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[233px] !rounded-prism-21 p-2">
        {ANALYTICS_RANGE_PRESETS.map(preset => (
          <MenuItem
            key={preset}
            role="menuitemradio"
            aria-checked={preset === range}
            onSelect={() => onChange(preset)}
            className="justify-between"
          >
            {RANGE_LABELS[preset]}
            {preset === range && <Check aria-hidden className="!text-prism-nav" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

type ExportFormat = "daily" | "events";

function download(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Screen Review 093 I08 and D4: Export opens a menu of Daily totals (the
 * default, aggregates only) and Event records. While pending it shows
 * Exporting and blocks a second press; failures can be retried from the toast.
 */
export function ExportMenu({
  range,
  tzOffsetMinutes,
  handle,
  compact,
}: {
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
  handle: string;
  // 390: a 44 icon button with aria-label Export
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) =>
      trpcClient.analytics.exportCsv.mutate({ range, tzOffsetMinutes, format }),
    onSuccess: (result, format) => {
      if (!result) return;
      const suffix = format === "daily" ? "-daily" : "";
      download(result.csv, `amped-bio-analytics-${handle}-${range}${suffix}.csv`);
      const count = result.rowCount.toLocaleString("en-US");
      toast.add({
        type: "success",
        title:
          format === "daily"
            ? `Exported ${count} rows of daily totals`
            : result.truncated
              ? `Exported the first ${count} events`
              : `Exported ${count} events`,
      });
    },
    onError: (_error, format) =>
      toast.add({
        type: "error",
        title: "Export failed",
        actionProps: { children: "Retry", onClick: () => exportMutation.mutate(format) },
      }),
  });
  const pending = exportMutation.isPending;

  const choose = (format: ExportFormat) => {
    setOpen(false);
    exportMutation.mutate(format);
  };

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild disabled={pending}>
        {compact ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label={pending ? "Exporting" : "Export"}
            aria-busy={pending}
          >
            {pending ? (
              <Loader2 aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <Download aria-hidden />
            )}
          </Button>
        ) : (
          <Button variant="secondary" aria-busy={pending}>
            {pending ? (
              <Loader2 aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <Download aria-hidden />
            )}
            {pending ? "Exporting" : "Export"}
          </Button>
        )}
      </MenuTrigger>
      <MenuContent align="end" className="w-[288px] !rounded-prism-21 p-2">
        <MenuItem onSelect={() => choose("daily")} className="items-start py-2">
          <span className="flex flex-col">
            <span className="text-prism-label font-semibold text-prism-ink">Daily totals</span>
            <span className="text-prism-meta text-prism-ink-2">
              One row per day for each link and source. No times, cities or session IDs.
            </span>
          </span>
        </MenuItem>
        <MenuItem onSelect={() => choose("events")} className="items-start py-2">
          <span className="flex flex-col">
            <span className="text-prism-label font-semibold text-prism-ink">Event records</span>
            <span className="text-prism-meta text-prism-ink-2">
              One row per view or click, with time, city, device and a session ID. Up to 100,000
              rows.
            </span>
          </span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
